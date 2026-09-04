export type StartServerOptions = {
  hostname: string;
  port: number;
  /** Absolute filesystem path to the directory of static assets to serve (Design Notes). */
  staticDir: string;
};

/**
 * `Bun.serve` + static asset serving from `staticDir`. `/` maps to `index.html`; any other path
 * resolves via `Bun.file(staticDir + pathname)`, 404 when the file doesn't exist (Design Notes) —
 * this naturally covers a missing `staticDir` too, since `Bun.file(...).exists()` is `false` for a
 * missing parent directory.
 */
export function startServer({ hostname, port, staticDir }: StartServerOptions): Bun.Server<undefined> {
  return Bun.serve({
    hostname,
    port,
    async fetch(request) {
      const { pathname } = new URL(request.url);
      const filePath = staticDir + (pathname === "/" ? "/index.html" : pathname);
      const file = Bun.file(filePath);
      if (!(await file.exists())) {
        return new Response("Not Found", { status: 404 });
      }
      return new Response(file);
    },
  });
}
