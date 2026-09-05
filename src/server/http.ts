export type StartServerOptions = {
  hostname: string;
  port: number;
  /** Absolute filesystem path to the directory of static assets to serve (Design Notes). */
  staticDir: string;
  /** When set, `GET /event` is routed here instead of static serving (`server/sse.ts`). */
  onEventRequest?: (request: Request) => Response;
  /** When set, `POST /ingest` is routed here: lets a joining process forward its own events to the one shared server (`plugin.ts`). */
  onIngestRequest?: (request: Request) => Promise<Response>;
};

/**
 * `Bun.serve` + static asset serving from `staticDir`. `/` maps to `index.html`; any other path
 * resolves via `Bun.file(staticDir + pathname)`, 404 when the file doesn't exist (Design Notes) —
 * this naturally covers a missing `staticDir` too, since `Bun.file(...).exists()` is `false` for a
 * missing parent directory. `GET /event` is delegated to `onEventRequest` and `POST /ingest` to
 * `onIngestRequest` when provided, before static serving.
 */
export function startServer({
  hostname,
  port,
  staticDir,
  onEventRequest,
  onIngestRequest,
}: StartServerOptions): Bun.Server<undefined> {
  return Bun.serve({
    hostname,
    port,
    async fetch(request, server) {
      const { pathname } = new URL(request.url);
      if (pathname === "/event" && request.method === "GET" && onEventRequest) {
        // SSE streams sit quiet between broadcasts; Bun's default 10s idleTimeout would otherwise
        // kill the connection mid-stream (Design Notes — see Bun's own SSE guide).
        server.timeout(request, 0);
        return onEventRequest(request);
      }
      if (pathname === "/ingest" && request.method === "POST" && onIngestRequest) {
        return onIngestRequest(request);
      }
      const filePath = staticDir + (pathname === "/" ? "/index.html" : pathname);
      const file = Bun.file(filePath);
      if (!(await file.exists())) {
        return new Response("Not Found", { status: 404 });
      }
      return new Response(file);
    },
    // Without this, an uncaught throw in `fetch` makes Bun print the error/stack straight to
    // stderr (Design Notes: this plugin runs in-process with opencode's TUI, so that leaks into
    // it). A 500 here keeps that fully silent, matching every other failure path in this plugin.
    error() {
      return new Response("Internal Server Error", { status: 500 });
    },
  });
}
