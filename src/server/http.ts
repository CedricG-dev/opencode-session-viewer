import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import { Readable } from "node:stream";

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

/** What `startServer` resolves to -- a thin, framework-agnostic stand-in for the `Bun.Server`
 * shape this module used to return directly, so callers (`plugin.ts`, tests) didn't have to
 * change beyond `await`ing the now-async `startServer`. */
export type AppServer = {
  url: URL;
  stop: (closeActiveConnections?: boolean) => Promise<void>;
};

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};

/** Node's `IncomingMessage` -> the Web-standard `Request` the rest of this module (and
 * `server/sse.ts`) is written against. `Request`/`Response`/`Headers`/`ReadableStream` are all
 * global in Node 18+, no dependency needed. */
function toWebRequest(req: IncomingMessage): Request {
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (typeof value === "string") headers.set(key, value);
    else if (Array.isArray(value)) headers.set(key, value.join(", "));
  }
  const hasBody = req.method !== "GET" && req.method !== "HEAD";
  return new Request(`http://${req.headers.host ?? "localhost"}${req.url ?? "/"}`, {
    method: req.method,
    headers,
    body: hasBody ? (Readable.toWeb(req) as unknown as ReadableStream) : undefined,
    // Required by the Fetch spec whenever a stream body is provided.
    duplex: hasBody ? "half" : undefined,
  } as RequestInit);
}

/** Writes a Web-standard `Response` (including a streaming body, e.g. SSE) out to a Node
 * `ServerResponse`. Destroying the Node stream on client disconnect propagates back to the
 * original `ReadableStream`'s `cancel()` (e.g. `server/sse.ts`'s connection cleanup). */
async function sendWebResponse(res: ServerResponse, response: Response): Promise<void> {
  res.statusCode = response.status;
  response.headers.forEach((value, key) => res.setHeader(key, value));
  if (!response.body) {
    res.end();
    return;
  }
  const nodeStream = Readable.fromWeb(response.body as never);
  res.once("close", () => nodeStream.destroy());
  await new Promise<void>((resolve, reject) => {
    nodeStream.once("error", reject).pipe(res).once("finish", resolve).once("error", reject);
  });
}

/** `/` maps to `index.html`; any other path resolves under `staticDir`, 404 on any read failure
 * (missing file, missing `staticDir`, permission error -- Design Notes: never throws). */
async function serveStatic(staticDir: string, pathname: string): Promise<Response> {
  const filePath = staticDir + (pathname === "/" ? "/index.html" : pathname);
  try {
    const data = await readFile(filePath);
    const ext = filePath.slice(filePath.lastIndexOf("."));
    return new Response(data, { headers: { "Content-Type": MIME_TYPES[ext] ?? "application/octet-stream" } });
  } catch {
    return new Response("Not Found", { status: 404 });
  }
}

/**
 * `node:http` + static asset serving from `staticDir`, wrapped so the rest of the codebase keeps
 * talking to the Web-standard `Request`/`Response` API (`onEventRequest`/`onIngestRequest`,
 * `server/sse.ts`) unchanged. `GET /event` is delegated to `onEventRequest` and `POST /ingest` to
 * `onIngestRequest` when provided, before static serving.
 */
export function startServer({
  hostname,
  port,
  staticDir,
  onEventRequest,
  onIngestRequest,
}: StartServerOptions): Promise<AppServer> {
  const server = createServer(async (req, res) => {
    try {
      const request = toWebRequest(req);
      const { pathname } = new URL(request.url);
      let response: Response;
      if (pathname === "/event" && req.method === "GET" && onEventRequest) {
        // SSE streams sit quiet between broadcasts; disable Node's request timeout so it never
        // kills the connection mid-stream (Design Notes -- same intent as Bun's per-request
        // `server.timeout(request, 0)` this replaced).
        req.socket.setTimeout(0);
        response = onEventRequest(request);
      } else if (pathname === "/ingest" && req.method === "POST" && onIngestRequest) {
        response = await onIngestRequest(request);
      } else {
        response = await serveStatic(staticDir, pathname);
      }
      await sendWebResponse(res, response);
    } catch {
      // Matches every other failure path in this plugin: never leak an error, never crash the
      // process opencode runs in-process with.
      if (!res.headersSent) res.statusCode = 500;
      res.end();
    }
  });

  // No default request/header timeout: this server exists as long as the dashboard tab does.
  server.requestTimeout = 0;
  server.headersTimeout = 0;

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, hostname, () => {
      const address = server.address();
      const boundHost = typeof address === "object" && address ? address.address : hostname;
      const boundPort = typeof address === "object" && address ? address.port : port;
      const url = new URL(`http://${boundHost.includes(":") ? `[${boundHost}]` : boundHost}:${boundPort}/`);
      resolve({
        url,
        stop: (closeActiveConnections = false) =>
          new Promise((resolveStop) => {
            if (closeActiveConnections) server.closeAllConnections();
            server.close(() => resolveStop());
          }),
      });
    });
  });
}
