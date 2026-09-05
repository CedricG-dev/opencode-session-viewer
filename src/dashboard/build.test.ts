import { afterEach, describe, expect, test } from "vitest";
import { access, mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type AppServer, startServer } from "../server/http.js";
import { buildDashboard } from "../../scripts/build-dashboard.mjs";

/**
 * Exercises the same `buildDashboard` call the `package.json` `build` script runs (against a
 * unique temp outdir, never the real `dist/`), then serves the result the way `plugin.ts` does.
 * Closes the gap where `npm test` never actually runs the build -- a regression in `main.ts`'s
 * import graph (e.g. a bad import) would otherwise only surface when a developer manually runs
 * `npm run build`.
 */
describe("dashboard build", () => {
  let outdir: string | undefined;
  let server: AppServer | undefined;

  afterEach(async () => {
    await server?.stop(true);
    server = undefined;
    if (outdir) await rm(outdir, { recursive: true, force: true });
    outdir = undefined;
  });

  test("build succeeds and the output is servable at / with a valid entry script", async () => {
    outdir = await mkdtemp(join(tmpdir(), "session-viewer-build-"));

    await buildDashboard(outdir);

    const files = await readdir(outdir);
    expect(files).toContain("index.html");
    const entryJs = files.find((file) => file.endsWith(".js"));
    expect(entryJs).toBeDefined();
    await expect(access(join(outdir, entryJs!))).resolves.toBeUndefined();

    const html = await readFile(join(outdir, "index.html"), "utf8");
    expect(html).toContain(entryJs!);

    server = await startServer({ hostname: "127.0.0.1", port: 0, staticDir: outdir });
    const response = await fetch(server.url);

    expect(response.status).toBe(200);
    expect(await response.text()).toContain('id="app"');
  });
});
