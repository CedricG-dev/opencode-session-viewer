import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startServer } from "../server/http.js";

/**
 * Exercises the same `Bun.build` call the `package.json` `build` script runs (against a unique
 * temp outdir, never the real `dist/`), then serves the result the way `plugin.ts` does. Closes
 * the gap where `bun test` never actually runs the build -- a regression in `main.ts`'s import
 * graph (e.g. a bad import) would otherwise only surface when a developer manually runs
 * `bun run build`.
 */
describe("dashboard build", () => {
  let outdir: string | undefined;
  let server: Bun.Server<undefined> | undefined;

  afterEach(async () => {
    await server?.stop(true);
    server = undefined;
    if (outdir) await rm(outdir, { recursive: true, force: true });
    outdir = undefined;
  });

  test("build succeeds and the output is servable at / with a valid entry script", async () => {
    outdir = await mkdtemp(join(tmpdir(), "session-viewer-build-"));

    const result = await Bun.build({
      entrypoints: [join(import.meta.dir, "index.html")],
      outdir,
    });
    expect(result.success).toBe(true);

    const files = await readdir(outdir);
    expect(files).toContain("index.html");
    const entryJs = files.find((file) => file.endsWith(".js"));
    expect(entryJs).toBeDefined();
    expect(await Bun.file(join(outdir, entryJs!)).exists()).toBe(true);

    const html = await Bun.file(join(outdir, "index.html")).text();
    expect(html).toContain(entryJs!);

    server = startServer({ hostname: "127.0.0.1", port: 0, staticDir: outdir });
    const response = await fetch(server.url);

    expect(response.status).toBe(200);
    expect(await response.text()).toContain('id="app"');
  });
});
