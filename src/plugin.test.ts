import { afterEach, describe, expect, test } from "vitest";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { PluginInput } from "@opencode-ai/plugin";
import type { Event, Session } from "@opencode-ai/sdk";
import { getViewModel } from "./core/state-store.js";
import { closeAllConnections } from "./server/sse.js";
import type { AppServer, StartServerOptions } from "./server/http.js";
import {
  createHandler,
  dispatchEvent,
  resolveConfig,
  resolveOpenCommand,
  resolveStaticDir,
  type PluginDeps,
  type SpawnFn,
} from "./plugin.js";

type LogCall = { service: string; level: string; message: string };
type ToastCall = { title?: string; message: string; variant: string };

function makeClient(): { client: PluginInput["client"]; logs: LogCall[]; toasts: ToastCall[] } {
  const logs: LogCall[] = [];
  const toasts: ToastCall[] = [];
  const client = {
    app: {
      async log({ body }: { body: LogCall }) {
        logs.push(body);
        return true;
      },
    },
    tui: {
      async showToast({ body }: { body: ToastCall }) {
        toasts.push(body);
        return true;
      },
    },
  } as unknown as PluginInput["client"];
  return { client, logs, toasts };
}

function fakeServer(stopped: { count: number }, stopArgs: unknown[] = []): AppServer {
  return {
    url: new URL("http://127.0.0.1:12345/"),
    async stop(closeActiveConnections?: boolean) {
      stopped.count += 1;
      stopArgs.push(closeActiveConnections);
    },
  };
}

function makeSession(id: string): Session {
  return {
    id,
    projectID: "proj-1",
    directory: "/tmp/proj",
    title: `Session ${id}`,
    version: "1",
    time: { created: 1, updated: 1 },
  };
}

/** Reads a single `data: <json>\n\n` message off a `handleEventRequest`/broadcast stream. */
async function readSseMessage(reader: ReadableStreamDefaultReader<Uint8Array>): Promise<unknown> {
  const { value, done } = await reader.read();
  if (done || !value) throw new Error("stream ended before a message was received");
  const line = new TextDecoder().decode(value);
  return JSON.parse(line.slice("data: ".length, line.indexOf("\n\n")));
}

function fakeSubprocess(exitCode: number): ReturnType<SpawnFn> {
  return { exited: Promise.resolve(exitCode) };
}

/** Lets the fire-and-forget `subprocess.exited.then(...)` chain in plugin.ts settle before assertions. */
function flushMicrotasks(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe("resolveOpenCommand", () => {
  test("darwin opens via `open`", () => {
    expect(resolveOpenCommand("darwin", "http://127.0.0.1:4000/")).toEqual(["open", "http://127.0.0.1:4000/"]);
  });

  test("win32 opens via `cmd /c start`", () => {
    expect(resolveOpenCommand("win32", "http://127.0.0.1:4000/")).toEqual([
      "cmd",
      "/c",
      "start",
      "",
      "http://127.0.0.1:4000/",
    ]);
  });

  test("other platforms open via `xdg-open`", () => {
    expect(resolveOpenCommand("linux", "http://127.0.0.1:4000/")).toEqual(["xdg-open", "http://127.0.0.1:4000/"]);
  });
});

describe("resolveStaticDir", () => {
  test("resolves to the project-root dist/ directory, matching plugin.ts's own directory", () => {
    const expected = join(dirname(fileURLToPath(import.meta.url)), "..", "dist");
    expect(resolveStaticDir()).toBe(expected);
  });
});

describe("resolveConfig", () => {
  test("no options given: falls back to the documented defaults", () => {
    expect(resolveConfig(undefined)).toEqual({ port: 0, hostname: "127.0.0.1", autoLaunch: true });
  });

  test("valid options supplied: resolves to exactly those values", () => {
    expect(resolveConfig({ port: 4097, hostname: "0.0.0.0", autoLaunch: false })).toEqual({
      port: 4097,
      hostname: "0.0.0.0",
      autoLaunch: false,
    });
  });

  test("wrong-typed port: falls back to its default, others resolve independently", () => {
    expect(resolveConfig({ port: "4097", hostname: "0.0.0.0" })).toEqual({
      port: 0,
      hostname: "0.0.0.0",
      autoLaunch: true,
    });
  });

  test("wrong-typed hostname: falls back to its default, others resolve independently", () => {
    expect(resolveConfig({ hostname: 12345, port: 4097 })).toEqual({
      port: 4097,
      hostname: "127.0.0.1",
      autoLaunch: true,
    });
  });

  test("wrong-typed autoLaunch: falls back to its default, others resolve independently", () => {
    expect(resolveConfig({ autoLaunch: "false", port: 4097 })).toEqual({
      port: 4097,
      hostname: "127.0.0.1",
      autoLaunch: true,
    });
  });
});

describe("plugin factory", () => {
  afterEach(() => {
    closeAllConnections();
  });

  test("plugin loads normally: server starts, browser opens to the bound URL, dispose() stops the server with stop(true)", async () => {
    const { client, toasts } = makeClient();
    const stopped = { count: 0 };
    const stopArgs: unknown[] = [];
    const server = fakeServer(stopped, stopArgs);
    const spawnCalls: string[][] = [];
    const deps: PluginDeps = {
      startServer: () => server,
      spawn: (cmd) => {
        spawnCalls.push(cmd as string[]);
        return fakeSubprocess(0);
      },
    };

    const hooks = await createHandler(deps)({ client } as PluginInput);
    await flushMicrotasks();

    expect(spawnCalls).toEqual([resolveOpenCommand(process.platform, server.url.toString())]);
    // Toast fires regardless of autoLaunch, so the URL is visible in the TUI without digging logs.
    expect(toasts).toEqual([{ title: "opencode-session-viewer", message: `Dashboard: ${server.url}`, variant: "info" }]);
    await hooks.dispose?.();
    expect(stopped.count).toBe(1);
    expect(stopArgs).toEqual([true]);
  });

  test("options supplied: port and hostname reach deps.startServer verbatim", async () => {
    const { client } = makeClient();
    const stopped = { count: 0 };
    let receivedOptions: StartServerOptions | undefined;
    const deps: PluginDeps = {
      startServer: (options) => {
        receivedOptions = options;
        return fakeServer(stopped);
      },
      spawn: () => fakeSubprocess(0),
    };

    const hooks = await createHandler(deps)({ client } as PluginInput, {
      port: 4097,
      hostname: "0.0.0.0",
      autoLaunch: false,
    });
    await flushMicrotasks();

    expect(receivedOptions?.port).toBe(4097);
    expect(receivedOptions?.hostname).toBe("0.0.0.0");
    await hooks.dispose?.();
  });

  test("autoLaunch:false, bind succeeds: deps.spawn is never called for the browser tab, but the URL still reaches the user via toast", async () => {
    const { client, toasts } = makeClient();
    const stopped = { count: 0 };
    const server = fakeServer(stopped);
    const spawnCalls: string[][] = [];
    const deps: PluginDeps = {
      startServer: () => server,
      spawn: (cmd) => {
        spawnCalls.push(cmd as string[]);
        return fakeSubprocess(0);
      },
    };

    const hooks = await createHandler(deps)({ client } as PluginInput, { autoLaunch: false });
    await flushMicrotasks();

    expect(spawnCalls).toEqual([]);
    expect(toasts).toEqual([{ title: "opencode-session-viewer", message: `Dashboard: ${server.url}`, variant: "info" }]);
    await hooks.dispose?.();
  });

  test("browser opener exits non-zero: ignored silently, server keeps running", async () => {
    const { client } = makeClient();
    const stopped = { count: 0 };
    const server = fakeServer(stopped);
    const deps: PluginDeps = {
      startServer: () => server,
      spawn: () => fakeSubprocess(1),
    };

    const hooks = await createHandler(deps)({ client } as PluginInput);
    await flushMicrotasks();

    expect(stopped.count).toBe(0);
    await hooks.dispose?.();
    expect(stopped.count).toBe(1);
  });

  test("dispose(): server.stop() rejecting is caught, never thrown", async () => {
    const { client } = makeClient();
    const deps: PluginDeps = {
      startServer: () =>
        ({
          url: new URL("http://127.0.0.1:12345/"),
          async stop() {
            throw new Error("stop failed");
          },
        }) as AppServer,
      spawn: () => fakeSubprocess(0),
    };

    const hooks = await createHandler(deps)({ client } as PluginInput);
    await flushMicrotasks();

    await expect(hooks.dispose?.()).resolves.toBeUndefined();
  });

  test("server bind fails: factory returns Hooks without throwing, spawn is never called, dispose() is a safe no-op", async () => {
    const { client } = makeClient();
    const deps: PluginDeps = {
      startServer: () => {
        throw new Error("bind failed");
      },
      spawn: () => {
        throw new Error("spawn should not be called when the server never started");
      },
    };

    const hooks = await createHandler(deps)({ client } as PluginInput);

    await expect(hooks.dispose?.()).resolves.toBeUndefined();
  });

  test("browser fails to open: server keeps running, factory does not throw", async () => {
    const { client } = makeClient();
    const stopped = { count: 0 };
    const deps: PluginDeps = {
      startServer: () => fakeServer(stopped),
      spawn: () => {
        throw new Error("ENOENT");
      },
    };

    const hooks = await createHandler(deps)({ client } as PluginInput);

    // server kept running: dispose() still stops the server that was started.
    await hooks.dispose?.();
    expect(stopped.count).toBe(1);
  });
});

describe("plugin factory: lockfile join (one server for all sessions)", () => {
  afterEach(() => {
    closeAllConnections();
  });

  test("existing lock names a live pid: joins it, never starts its own server, never opens a second browser tab", async () => {
    const { client, toasts } = makeClient();
    const startServerCalls: unknown[] = [];
    const spawnCalls: string[][] = [];
    const deps: PluginDeps = {
      startServer: (options) => {
        startServerCalls.push(options);
        return fakeServer({ count: 0 });
      },
      spawn: (cmd) => {
        spawnCalls.push(cmd as string[]);
        return fakeSubprocess(0);
      },
      readLock: () => ({ hostname: "127.0.0.1", port: 9999, pid: 4242 }),
      isPidAlive: (pid) => pid === 4242,
    };

    const hooks = await createHandler(deps)({ client } as PluginInput);
    await flushMicrotasks();

    expect(startServerCalls).toHaveLength(0);
    // A joining session doesn't own the server: its dashboard tab is already open elsewhere, so
    // it must never spawn a second browser tab (Design Notes: one server AND one dashboard tab).
    expect(spawnCalls).toEqual([]);
    // A joining session still toasts the URL, so its user isn't left without a way to find it.
    expect(toasts).toEqual([{ title: "opencode-session-viewer", message: "Dashboard: http://127.0.0.1:9999", variant: "info" }]);
    await hooks.dispose?.();
  });

  test("joined process forwards its session events via POST /ingest on the remote server", async () => {
    const { client } = makeClient();
    const fetchCalls: { url: string; init?: RequestInit }[] = [];
    const deps: PluginDeps = {
      startServer: () => fakeServer({ count: 0 }),
      spawn: () => fakeSubprocess(0),
      readLock: () => ({ hostname: "127.0.0.1", port: 9999, pid: 4242 }),
      isPidAlive: () => true,
      fetch: (async (url: string, init?: RequestInit) => {
        fetchCalls.push({ url, init });
        return new Response(null, { status: 204 });
      }) as typeof fetch,
    };

    const hooks = await createHandler(deps)({ client } as PluginInput);
    await flushMicrotasks();

    const event: Event = { type: "session.created", properties: { info: makeSession("s-forwarded") } };
    await hooks.event?.({ event });

    expect(fetchCalls).toHaveLength(1);
    expect(fetchCalls[0]?.url).toBe("http://127.0.0.1:9999/ingest");
    expect(JSON.parse(fetchCalls[0]?.init?.body as string)).toEqual(event);
    // No server owned by this process: dispose() is a no-op, doesn't touch a lock it doesn't own.
    await expect(hooks.dispose?.()).resolves.toBeUndefined();
  });

  test("existing lock names a dead pid: starts its own server and overwrites the stale lock", async () => {
    const { client } = makeClient();
    const server = fakeServer({ count: 0 });
    const writeLockCalls: unknown[] = [];
    const releaseLockCalls: number[] = [];
    const deps: PluginDeps = {
      startServer: () => server,
      spawn: () => fakeSubprocess(0),
      readLock: () => ({ hostname: "127.0.0.1", port: 9999, pid: 4242 }),
      isPidAlive: () => false,
      writeLock: (info) => writeLockCalls.push(info),
      releaseLock: (pid) => releaseLockCalls.push(pid),
    };

    const hooks = await createHandler(deps)({ client } as PluginInput);
    await flushMicrotasks();

    expect(writeLockCalls).toEqual([{ hostname: "127.0.0.1", port: 12345, pid: process.pid }]);
    await hooks.dispose?.();
    expect(releaseLockCalls).toEqual([process.pid]);
  });

  test("no readLock/writeLock/isPidAlive deps supplied: behaves exactly as before (always starts its own server)", async () => {
    const { client } = makeClient();
    const stopped = { count: 0 };
    const deps: PluginDeps = { startServer: () => fakeServer(stopped), spawn: () => fakeSubprocess(0) };

    const hooks = await createHandler(deps)({ client } as PluginInput);
    await flushMicrotasks();
    await hooks.dispose?.();

    expect(stopped.count).toBe(1);
  });
});

describe("Hooks.tool.opencode_session_viewer_dashboard_open", () => {
  afterEach(() => {
    closeAllConnections();
  });

  test("server started here: spawns the opener again and reports the URL", async () => {
    const { client, toasts } = makeClient();
    const server = fakeServer({ count: 0 });
    const spawnCalls: string[][] = [];
    const deps: PluginDeps = {
      startServer: () => server,
      spawn: (cmd) => {
        spawnCalls.push(cmd as string[]);
        return fakeSubprocess(0);
      },
    };

    const hooks = await createHandler(deps)({ client } as PluginInput);
    await flushMicrotasks();
    toasts.length = 0; // clear the startup toast to isolate the tool's own toast
    spawnCalls.length = 0; // clear the autoLaunch spawn to isolate the tool's own spawn

    const result = await hooks.tool!.opencode_session_viewer_dashboard_open.execute({}, {} as never);

    expect(spawnCalls).toEqual([resolveOpenCommand(process.platform, server.url.toString())]);
    expect(toasts).toEqual([{ title: "opencode-session-viewer", message: `Dashboard: ${server.url}`, variant: "info" }]);
    expect(result).toBe(`Dashboard opened at ${server.url}`);
    await hooks.dispose?.();
  });

  test("joined an existing server: spawns the opener against remoteBase", async () => {
    const { client } = makeClient();
    const spawnCalls: string[][] = [];
    const deps: PluginDeps = {
      startServer: () => fakeServer({ count: 0 }),
      spawn: (cmd) => {
        spawnCalls.push(cmd as string[]);
        return fakeSubprocess(0);
      },
      readLock: () => ({ hostname: "127.0.0.1", port: 9999, pid: 4242 }),
      isPidAlive: () => true,
    };

    const hooks = await createHandler(deps)({ client } as PluginInput);
    await flushMicrotasks();
    spawnCalls.length = 0;

    const result = await hooks.tool!.opencode_session_viewer_dashboard_open.execute({}, {} as never);

    expect(spawnCalls).toEqual([resolveOpenCommand(process.platform, "http://127.0.0.1:9999")]);
    expect(result).toBe("Dashboard opened at http://127.0.0.1:9999");
    await hooks.dispose?.();
  });

  test("server failed to start: reports it's not running, never spawns", async () => {
    const { client } = makeClient();
    const deps: PluginDeps = {
      startServer: () => {
        throw new Error("bind failed");
      },
      spawn: () => {
        throw new Error("spawn should not be called");
      },
    };

    const hooks = await createHandler(deps)({ client } as PluginInput);

    const result = await hooks.tool!.opencode_session_viewer_dashboard_open.execute({}, {} as never);

    expect(result).toBe("The opencode-session-viewer dashboard is not running (it failed to start).");
  });

  test("opener throws: still reports the URL as a fallback for the user to open manually", async () => {
    const { client } = makeClient();
    const server = fakeServer({ count: 0 });
    const deps: PluginDeps = {
      startServer: () => server,
      spawn: () => {
        throw new Error("ENOENT");
      },
    };

    const hooks = await createHandler(deps)({ client } as PluginInput);
    await flushMicrotasks();

    const result = await hooks.tool!.opencode_session_viewer_dashboard_open.execute({}, {} as never);

    expect(result).toBe(`Dashboard opened at ${server.url}`);
    await hooks.dispose?.();
  });
});

describe("dispatchEvent", () => {
  test("session.created dispatches to state-store and returns the session id", () => {
    const event: Event = { type: "session.created", properties: { info: makeSession("s-dispatch-created") } };
    expect(dispatchEvent(event)).toBe("s-dispatch-created");
    expect(getViewModel("s-dispatch-created")).toBeDefined();
  });

  test("session.status dispatches to state-store and returns the session id", () => {
    dispatchEvent({ type: "session.created", properties: { info: makeSession("s-dispatch-status") } });

    const event: Event = {
      type: "session.status",
      properties: { sessionID: "s-dispatch-status", status: { type: "busy" } },
    };
    expect(dispatchEvent(event)).toBe("s-dispatch-status");
    expect(getViewModel("s-dispatch-status")?.status).toBe("busy");
  });

  test("message.updated for an unknown session returns the session id even though state-store no-ops", () => {
    const event: Event = {
      type: "message.updated",
      properties: {
        info: {
          id: "msg-1",
          sessionID: "s-dispatch-unknown",
          role: "user",
          time: { created: 1 },
          agent: "build",
          model: { providerID: "provider-1", modelID: "model-1" },
        },
      },
    };
    expect(dispatchEvent(event)).toBe("s-dispatch-unknown");
    expect(getViewModel("s-dispatch-unknown")).toBeUndefined();
  });
});

describe("Hooks.event", () => {
  afterEach(() => {
    closeAllConnections();
  });

  test("known session: a connected SSE client receives a data: line equal to getViewModel(id)", async () => {
    const { client } = makeClient();
    const stopped = { count: 0 };
    let onEventRequest: StartServerOptions["onEventRequest"];
    const deps: PluginDeps = {
      startServer: (options) => {
        onEventRequest = options.onEventRequest;
        return fakeServer(stopped);
      },
      spawn: () => fakeSubprocess(0),
    };

    const hooks = await createHandler(deps)({ client } as PluginInput);
    await flushMicrotasks();

    await hooks.event?.({
      event: { type: "session.created", properties: { info: makeSession("s-event-known") } },
    });

    const response = onEventRequest!(new Request("http://127.0.0.1/event"));
    const reader = response.body!.getReader();
    await readSseMessage(reader); // initial snapshot

    await hooks.event?.({
      event: {
        type: "session.status",
        properties: { sessionID: "s-event-known", status: { type: "busy" } },
      },
    });

    await expect(readSseMessage(reader)).resolves.toEqual(getViewModel("s-event-known"));
    await reader.cancel();
  });

  test("unknown session: event hook resolves without broadcasting anything", async () => {
    const { client } = makeClient();
    const stopped = { count: 0 };
    const deps: PluginDeps = {
      startServer: () => fakeServer(stopped),
      spawn: () => fakeSubprocess(0),
    };

    const hooks = await createHandler(deps)({ client } as PluginInput);
    await flushMicrotasks();

    await expect(
      hooks.event?.({
        event: {
          type: "session.status",
          properties: { sessionID: "s-event-never-seen", status: { type: "busy" } },
        },
      }),
    ).resolves.toBeUndefined();
    expect(getViewModel("s-event-never-seen")).toBeUndefined();
  });

  test("dispatch throws: event hook resolves without throwing", async () => {
    const { client } = makeClient();
    const stopped = { count: 0 };
    const deps: PluginDeps = {
      startServer: () => fakeServer(stopped),
      spawn: () => fakeSubprocess(0),
    };

    const hooks = await createHandler(deps)({ client } as PluginInput);
    await flushMicrotasks();

    // Malformed event: matches a known type but is missing the properties dispatchEvent reads,
    // triggering an unexpected TypeError inside the handler.
    const malformed = { type: "session.created", properties: {} } as unknown as Event;

    await expect(hooks.event?.({ event: malformed })).resolves.toBeUndefined();
  });
});
