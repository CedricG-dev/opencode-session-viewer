import { afterEach, describe, expect, test } from "bun:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { PluginInput } from "@opencode-ai/plugin";
import type { Event, Session } from "@opencode-ai/sdk";
import { getViewModel } from "./core/state-store.js";
import { closeAllConnections } from "./server/sse.js";
import type { StartServerOptions } from "./server/http.js";
import {
  createHandler,
  dispatchEvent,
  resolveConfig,
  resolveOpenCommand,
  resolveStaticDir,
  type PluginDeps,
} from "./plugin.js";

type LogCall = { service: string; level: string; message: string };

function makeClient(): { client: PluginInput["client"]; logs: LogCall[] } {
  const logs: LogCall[] = [];
  const client = {
    app: {
      async log({ body }: { body: LogCall }) {
        logs.push(body);
        return true;
      },
    },
  } as unknown as PluginInput["client"];
  return { client, logs };
}

function fakeServer(stopped: { count: number }, stopArgs: unknown[] = []): Bun.Server<undefined> {
  return {
    url: new URL("http://127.0.0.1:12345/"),
    async stop(closeActiveConnections?: boolean) {
      stopped.count += 1;
      stopArgs.push(closeActiveConnections);
    },
  } as unknown as Bun.Server<undefined>;
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

function fakeSubprocess(exitCode: number): ReturnType<typeof Bun.spawn> {
  return { exited: Promise.resolve(exitCode) } as unknown as ReturnType<typeof Bun.spawn>;
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
    const { client, logs } = makeClient();
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

    expect(logs).toHaveLength(0);
    expect(spawnCalls).toEqual([resolveOpenCommand(process.platform, server.url.toString())]);
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

  test("autoLaunch:false, bind succeeds: deps.spawn is never called, level:info log names the reachable URL", async () => {
    const { client, logs } = makeClient();
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
    expect(logs).toHaveLength(1);
    expect(logs[0]?.level).toBe("info");
    expect(logs[0]?.message).toContain(server.url.toString());
    await hooks.dispose?.();
  });

  test("browser opener exits non-zero: logs level:warn, server keeps running", async () => {
    const { client, logs } = makeClient();
    const stopped = { count: 0 };
    const deps: PluginDeps = {
      startServer: () => fakeServer(stopped),
      spawn: () => fakeSubprocess(1),
    };

    await createHandler(deps)({ client } as PluginInput);
    await flushMicrotasks();

    expect(logs).toHaveLength(1);
    expect(logs[0]?.level).toBe("warn");
  });

  test("dispose(): server.stop() rejecting is caught and logged, never thrown", async () => {
    const { client, logs } = makeClient();
    const deps: PluginDeps = {
      startServer: () =>
        ({
          url: new URL("http://127.0.0.1:12345/"),
          async stop() {
            throw new Error("stop failed");
          },
        }) as unknown as Bun.Server<undefined>,
      spawn: () => fakeSubprocess(0),
    };

    const hooks = await createHandler(deps)({ client } as PluginInput);
    await flushMicrotasks();

    await expect(hooks.dispose?.()).resolves.toBeUndefined();
    expect(logs.some((entry) => entry.level === "warn" && entry.message.includes("Failed to stop"))).toBe(true);
  });

  test("server bind fails: factory returns Hooks without throwing, logs level:error, dispose() is a safe no-op", async () => {
    const { client, logs } = makeClient();
    const deps: PluginDeps = {
      startServer: () => {
        throw new Error("bind failed");
      },
      spawn: () => {
        throw new Error("spawn should not be called when the server never started");
      },
    };

    const hooks = await createHandler(deps)({ client } as PluginInput);

    expect(logs).toHaveLength(1);
    expect(logs[0]?.level).toBe("error");
    expect(logs[0]?.service).toBe("opencode-session-viewer");
    await expect(hooks.dispose?.()).resolves.toBeUndefined();
  });

  test("browser fails to open: server keeps running, factory does not throw, logs level:warn", async () => {
    const { client, logs } = makeClient();
    const stopped = { count: 0 };
    const deps: PluginDeps = {
      startServer: () => fakeServer(stopped),
      spawn: () => {
        throw new Error("ENOENT");
      },
    };

    const hooks = await createHandler(deps)({ client } as PluginInput);

    expect(logs).toHaveLength(1);
    expect(logs[0]?.level).toBe("warn");
    // server kept running: dispose() still stops the server that was started.
    await hooks.dispose?.();
    expect(stopped.count).toBe(1);
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
    const { client, logs } = makeClient();
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
    expect(logs).toHaveLength(0);
    expect(getViewModel("s-event-never-seen")).toBeUndefined();
  });

  test("dispatch throws: event hook resolves without throwing, logs level:error", async () => {
    const { client, logs } = makeClient();
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
    expect(logs.some((entry) => entry.level === "error" && entry.message.includes("Failed to handle event"))).toBe(
      true,
    );
  });
});
