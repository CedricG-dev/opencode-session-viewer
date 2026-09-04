import { describe, expect, test } from "bun:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { PluginInput } from "@opencode-ai/plugin";
import { createHandler, resolveOpenCommand, resolveStaticDir, type PluginDeps } from "./plugin.js";

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

function fakeServer(stopped: { count: number }): Bun.Server<undefined> {
  return {
    url: new URL("http://127.0.0.1:12345/"),
    async stop() {
      stopped.count += 1;
    },
  } as unknown as Bun.Server<undefined>;
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

describe("plugin factory", () => {
  test("plugin loads normally: server starts, browser opens to the bound URL, dispose() stops the server", async () => {
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

    const hooks = await createHandler(deps)({ client } as PluginInput);
    await flushMicrotasks();

    expect(logs).toHaveLength(0);
    expect(spawnCalls).toEqual([resolveOpenCommand(process.platform, server.url.toString())]);
    await hooks.dispose?.();
    expect(stopped.count).toBe(1);
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
