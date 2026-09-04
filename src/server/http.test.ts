import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startServer } from "./http.js";

describe("server/http", () => {
  let staticDir: string;
  let server: Bun.Server<undefined> | undefined;

  beforeEach(async () => {
    staticDir = await mkdtemp(join(tmpdir(), "session-viewer-http-"));
  });

  afterEach(async () => {
    await server?.stop(true);
    server = undefined;
    await rm(staticDir, { recursive: true, force: true });
  });

  test("requested static file exists: GET /index.html present under staticDir returns 200 with content", async () => {
    await Bun.write(join(staticDir, "index.html"), "<h1>hi</h1>");
    server = startServer({ hostname: "127.0.0.1", port: 0, staticDir });

    const response = await fetch(new URL("/index.html", server.url));

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("<h1>hi</h1>");
  });

  test("'/' maps to index.html", async () => {
    await Bun.write(join(staticDir, "index.html"), "<h1>root</h1>");
    server = startServer({ hostname: "127.0.0.1", port: 0, staticDir });

    const response = await fetch(server.url);

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("<h1>root</h1>");
  });

  test("requested file missing: GET any path with no matching file returns 404", async () => {
    server = startServer({ hostname: "127.0.0.1", port: 0, staticDir });

    const response = await fetch(new URL("/missing.js", server.url));

    expect(response.status).toBe(404);
  });

  test("staticDir absent: GET any path returns 404, never throws", async () => {
    server = startServer({
      hostname: "127.0.0.1",
      port: 0,
      staticDir: join(staticDir, "does-not-exist"),
    });

    const response = await fetch(new URL("/index.html", server.url));

    expect(response.status).toBe(404);
  });

  test("GET /event delegates to onEventRequest instead of static serving", async () => {
    server = startServer({
      hostname: "127.0.0.1",
      port: 0,
      staticDir,
      onEventRequest: () => new Response("event-response"),
    });

    const response = await fetch(new URL("/event", server.url));

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("event-response");
  });

  test("POST /event falls through to static serving (404), never hits onEventRequest", async () => {
    server = startServer({
      hostname: "127.0.0.1",
      port: 0,
      staticDir,
      onEventRequest: () => new Response("event-response"),
    });

    const response = await fetch(new URL("/event", server.url), { method: "POST" });

    expect(response.status).toBe(404);
  });
});
