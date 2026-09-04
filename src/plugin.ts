import type { Hooks, Plugin, PluginInput } from "@opencode-ai/plugin";
import type { Event } from "@opencode-ai/sdk";
import { startServer } from "./server/http.js";
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

const SERVICE = "opencode-session-viewer";

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

function formatError(error: unknown): string {
  return error instanceof Error ? (error.stack ?? error.message) : String(error);
}

/** Never lets a failing `client.app.log()` call itself escape as an unhandled rejection. */
async function log(client: PluginInput["client"], level: "error" | "warn", message: string): Promise<void> {
  try {
    await client.app.log({ body: { service: SERVICE, level, message } });
  } catch {
    // best-effort logging only
  }
}

/** `new URL("../dist", import.meta.url)` from this file == project-root `dist/` (Design Notes). */
export function resolveStaticDir(): string {
  return Bun.fileURLToPath(new URL("../dist", import.meta.url));
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
  spawn: typeof Bun.spawn;
};

/**
 * Dependency-injected core of the factory, exported so tests can supply fakes for `startServer`/
 * `spawn` without mutating any shared module state (bun:test's `mock.module` mutates the module
 * registry process-wide, leaking across test files — plain parameters avoid that entirely).
 */
export function createHandler(deps: PluginDeps) {
  return async ({ client }: PluginInput): Promise<Hooks> => {
    let server: Bun.Server<undefined> | undefined;

    try {
      server = deps.startServer({
        hostname: "127.0.0.1",
        port: 0,
        staticDir: resolveStaticDir(),
        onEventRequest: () => handleEventRequest(getViewModels),
      });
    } catch (error) {
      await log(client, "error", `Failed to start local server: ${formatError(error)}`);
    }

    if (server) {
      try {
        // stdio: ignore avoids the well-documented Bun.spawn gotcha where an inherited/piped
        // stdio keeps the parent (opencode) process alive after the browser opener exits.
        const subprocess = deps.spawn(resolveOpenCommand(process.platform, server.url.toString()), {
          stdio: ["ignore", "ignore", "ignore"],
        });
        subprocess.exited
          .then((code) => (code === 0 ? undefined : log(client, "warn", `Browser opener exited with code ${code}`)))
          .catch((error) => log(client, "warn", `Failed to open browser: ${formatError(error)}`));
      } catch (error) {
        await log(client, "warn", `Failed to open browser: ${formatError(error)}`);
      }
    }

    return {
      async event({ event }) {
        try {
          const sessionID = dispatchEvent(event);
          if (!sessionID) return;
          const viewModel = getViewModel(sessionID);
          if (viewModel) broadcast(viewModel);
        } catch (error) {
          await log(client, "error", `Failed to handle event: ${formatError(error)}`);
        }
      },
      async dispose() {
        try {
          closeAllConnections();
          await server?.stop(true);
        } catch (error) {
          await log(client, "warn", `Failed to stop local server: ${formatError(error)}`);
        }
      },
    };
  };
}

const plugin: Plugin = createHandler({ startServer, spawn: Bun.spawn });

export default plugin;
