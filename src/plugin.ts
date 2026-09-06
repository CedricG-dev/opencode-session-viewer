import { spawn as nodeSpawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import type { Hooks, Plugin, PluginInput, PluginOptions } from "@opencode-ai/plugin";
import { tool } from "@opencode-ai/plugin/tool";
import type { Event } from "@opencode-ai/sdk";
import { type AppServer, startServer } from "./server/http.js";
import { type LockInfo, isPidAlive, readLock, releaseLock, writeLock } from "./server/lock.js";
import { broadcast, closeAllConnections, handleEventRequest } from "./server/sse.js";
import {
  getViewModel,
  getViewModels,
  handleMessageUpdated,
  handleSessionCreated,
  handleSessionError,
  handleSessionIdle,
  handleSessionStatus,
  handleSessionUpdated,
} from "./core/state-store.js";

/** Platform-native OS browser-opener command (Design Notes) — no new dependency. */
export function resolveOpenCommand(platform: string, url: string): string[] {
  switch (platform) {
    case "darwin":
      return ["open", url];
    case "win32":
      return ["cmd", "/c", "start", "", url];
    default:
      return ["xdg-open", url];
  }
}

export type ResolvedConfig = {
  hostname: string;
  port: number;
  autoLaunch: boolean;
};

const DEFAULT_CONFIG: ResolvedConfig = {
  hostname: "127.0.0.1",
  port: 0,
  autoLaunch: true,
};

/**
 * Reads `port`/`hostname`/`autoLaunch` from the factory's `options` argument (AD-5), with
 * type-checked fallback to `DEFAULT_CONFIG` per field — a wrong-typed option (e.g. `port` as a
 * string) falls back rather than being coerced.
 */
export function resolveConfig(options: PluginOptions | undefined): ResolvedConfig {
  return {
    hostname: typeof options?.hostname === "string" ? options.hostname : DEFAULT_CONFIG.hostname,
    port: typeof options?.port === "number" ? options.port : DEFAULT_CONFIG.port,
    autoLaunch: typeof options?.autoLaunch === "boolean" ? options.autoLaunch : DEFAULT_CONFIG.autoLaunch,
  };
}

/** `new URL("../dist", import.meta.url)` from this file == project-root `dist/` (Design Notes). */
export function resolveStaticDir(): string {
  return fileURLToPath(new URL("../dist", import.meta.url));
}

export type SpawnFn = (cmd: string[], options: { stdio: ["ignore", "ignore", "ignore"] }) => { exited: Promise<unknown> };

/** `node:child_process.spawn`, shaped to the one thing `createHandler` needs from it (an
 * `exited` promise), so it's a drop-in for what used to be `Bun.spawn`. */
export const spawnDetached: SpawnFn = (cmd, options) => {
  const [command, ...args] = cmd;
  const child = nodeSpawn(command!, args, options);
  return { exited: new Promise((resolve) => child.once("exit", resolve).once("error", resolve)) };
};

/** Fire-and-forget structured logging into opencode's own log file via `client.app.log()` (the
 * SDK method opencode's plugin docs document for this exact purpose) — never throws, never
 * blocks the caller on the log request settling. */
function log(
  client: PluginInput["client"],
  level: "info" | "warn" | "error",
  message: string,
  extra?: Record<string, unknown>,
): void {
  try {
    client?.app
      ?.log({ body: { service: "opencode-session-viewer", level, message, extra } })
      ?.catch(() => {});
  } catch {
    // Logging must never be the reason the plugin fails.
  }
}

/** Fire-and-forget TUI toast via `client.tui.showToast()` — surfaces the dashboard URL directly
 * in the terminal so the user never has to dig through opencode's log file for it (regardless of
 * `autoLaunch`). Never throws, never blocks the caller. */
function toast(client: PluginInput["client"], message: string): void {
  try {
    client?.tui
      ?.showToast({ body: { title: "opencode-session-viewer", message, variant: "info" } })
      ?.catch(() => {});
  } catch {
    // Toasting must never be the reason the plugin fails.
  }
}

/**
 * Dispatches one opencode `Event` to the matching `core/state-store.ts` handler, returning the
 * affected session id (if any) so the caller can broadcast its freshly-derived `ViewModel`.
 */
export function dispatchEvent(event: Event): string | undefined {
  switch (event.type) {
    case "session.created":
      handleSessionCreated(event);
      return event.properties.info.id;
    case "session.updated":
      handleSessionUpdated(event);
      return event.properties.info.id;
    case "session.status":
      handleSessionStatus(event);
      return event.properties.sessionID;
    case "session.idle":
      handleSessionIdle(event);
      return event.properties.sessionID;
    case "session.error":
      handleSessionError(event);
      return event.properties.sessionID;
    case "message.updated":
      handleMessageUpdated(event);
      return event.properties.info.sessionID;
    default:
      return undefined;
  }
}

export type PluginDeps = {
  startServer: typeof startServer;
  spawn: SpawnFn;
  /** Lock-file deps default to no-ops (never join, never persist) so tests that omit them keep the pre-lockfile, always-start-a-server behavior. */
  readLock?: () => LockInfo | undefined;
  writeLock?: (info: LockInfo) => void;
  releaseLock?: (pid: number) => void;
  isPidAlive?: (pid: number) => boolean;
  fetch?: typeof fetch;
};

/**
 * Dependency-injected core of the factory, exported so tests can supply fakes for `startServer`/
 * `spawn` without mutating any shared module state (a global mock registry mutates process-wide,
 * leaking across test files — plain parameters avoid that entirely).
 */
export function createHandler(deps: PluginDeps) {
  const readLockImpl = deps.readLock ?? (() => undefined);
  const writeLockImpl = deps.writeLock ?? (() => {});
  const releaseLockImpl = deps.releaseLock ?? (() => {});
  const isPidAliveImpl = deps.isPidAlive ?? (() => false);
  const fetchImpl = deps.fetch ?? fetch;

  return async (input: PluginInput, options?: PluginOptions): Promise<Hooks> => {
    const { client } = input;
    const config = resolveConfig(options);
    let server: AppServer | undefined;
    let remoteBase: string | undefined;

    // One server for all sessions (Design Notes): if a live process already owns the lockfile,
    // join it instead of binding a second port — this session's events get forwarded via /ingest.
    const existingLock = readLockImpl();
    if (existingLock && isPidAliveImpl(existingLock.pid)) {
      remoteBase = `http://${existingLock.hostname}:${existingLock.port}`;
      log(client, "info", "joining existing dashboard server", { remoteBase });
      toast(client, `Dashboard: ${remoteBase}`);
    } else {
      try {
        server = await deps.startServer({
          hostname: config.hostname,
          port: config.port,
          staticDir: resolveStaticDir(),
          onEventRequest: () => handleEventRequest(getViewModels),
          onIngestRequest: async (request) => {
            try {
              const event = (await request.json()) as Event;
              const sessionID = dispatchEvent(event);
              if (sessionID) {
                const viewModel = getViewModel(sessionID);
                if (viewModel) broadcast(viewModel);
              }
              return new Response(null, { status: 204 });
            } catch {
              return new Response("Bad Request", { status: 400 });
            }
          },
        });
        // ponytail: no cross-process file lock around this read-then-write, so two processes
        // starting in the same instant can both bind a server; the later writeLock just wins and
        // the loser's server leaks until its own dispose(). Add real locking if that race matters.
        writeLockImpl({ hostname: config.hostname, port: Number(server.url.port), pid: process.pid });
        log(client, "info", "dashboard server started", { url: server.url.toString() });
        toast(client, `Dashboard: ${server.url.toString()}`);
      } catch (error) {
        // Bind/start failed: no server, no lock — this session just has no dashboard.
        log(client, "warn", "dashboard server failed to start", { error: String(error) });
      }
    }

    // Only the session that actually started the server opens a browser tab (Design Notes: one
    // server AND one dashboard tab for all sessions) — a joining session's dashboard is already
    // open from whichever session started it.
    if (server && config.autoLaunch) {
      try {
        // stdio: ignore avoids the well-documented child_process gotcha where an inherited/piped
        // stdio keeps the parent (opencode) process alive after the browser opener exits.
        const subprocess = deps.spawn(resolveOpenCommand(process.platform, server.url.toString()), {
          stdio: ["ignore", "ignore", "ignore"],
        });
        subprocess.exited.catch(() => {});
      } catch {
        // Browser opener failed to launch: server still runs, nothing further to do.
      }
    }

    return {
      tool: {
        opencode_session_viewer_dashboard_open: tool({
          description:
            "Opens (or reopens) the opencode-session-viewer dashboard — a local, private, live " +
            "activity view of all opencode sessions — in the user's default browser. Use this " +
            "when the user asks to open, reopen, or show the (session-viewer) dashboard, e.g. " +
            "after they closed the browser tab. This is NOT opencode's own session-share/public-" +
            "link feature ('session_share'/'share a session') — do not use this tool for that.",
          args: {},
          async execute() {
            const url = server?.url.toString() ?? remoteBase;
            if (!url) return "The opencode-session-viewer dashboard is not running (it failed to start).";
            try {
              const subprocess = deps.spawn(resolveOpenCommand(process.platform, url), {
                stdio: ["ignore", "ignore", "ignore"],
              });
              subprocess.exited.catch(() => {});
            } catch {
              // Browser opener failed to launch: the URL below is still a valid fallback.
            }
            toast(client, `Dashboard: ${url}`);
            return `Dashboard opened at ${url}`;
          },
        }),
      },
      async event({ event }) {
        try {
          if (server) {
            const sessionID = dispatchEvent(event);
            if (!sessionID) return;
            const viewModel = getViewModel(sessionID);
            if (viewModel) broadcast(viewModel);
          } else if (remoteBase) {
            await fetchImpl(`${remoteBase}/ingest`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(event),
            });
          }
        } catch {
          // Event handling failed: drop it, never let it surface as an unhandled rejection.
        }
      },
      async dispose() {
        try {
          if (server) {
            closeAllConnections();
            await server.stop(true);
            releaseLockImpl(process.pid);
            log(client, "info", "dashboard server stopped");
          }
        } catch {
          // Shutdown failed: nothing left to do, the process is exiting anyway.
        }
      },
    };
  };
}

const plugin: Plugin = createHandler({ startServer, spawn: spawnDetached, readLock, writeLock, releaseLock, isPidAlive });

/**
 * Default-exports the `{ id, server }` shape (`PluginModule` from `@opencode-ai/plugin`), not a
 * bare function. opencode's loader (`readV1Plugin`) only recognizes a *record* default export as
 * a "v1" plugin; a plain function default export fails that check and falls through to a legacy
 * fallback path that treats every function-valued export in this module (`resolveConfig`,
 * `createHandler`, `spawnDetached`, ...) as an independent plugin factory and calls each one --
 * silently corrupting opencode's hook registry even when nothing throws, and hard-crashing when
 * one does (as `spawnDetached`'s array destructuring does on non-array input). `id` is required
 * for file-sourced plugins (local dev via `file://...` in `opencode.json`); harmless for the
 * npm-published path too, where it'd otherwise fall back to `package.json`'s `name`.
 */
export default { id: "opencode-session-viewer", server: plugin };
