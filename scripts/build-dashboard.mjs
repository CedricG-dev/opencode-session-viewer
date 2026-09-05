import { build } from "esbuild";
import { copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const DASHBOARD_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "dashboard");

/**
 * Bundles `src/dashboard/main.ts` (+ its `htm`/`preact`/`@preact/signals` import graph) into
 * `outdir/main.js`, copies `styles.css` through untouched, and rewrites `index.html`'s one
 * `./main.ts` reference to `./main.js`. No cache-busting hash on the output filename -- this is a
 * single-user local dashboard, not a CDN-served app; revisit if that ever changes.
 */
export async function buildDashboard(outdir) {
  await mkdir(outdir, { recursive: true });

  await build({
    entryPoints: [join(DASHBOARD_DIR, "main.ts")],
    bundle: true,
    format: "esm",
    outfile: join(outdir, "main.js"),
  });

  await copyFile(join(DASHBOARD_DIR, "styles.css"), join(outdir, "styles.css"));

  const html = await readFile(join(DASHBOARD_DIR, "index.html"), "utf8");
  await writeFile(join(outdir, "index.html"), html.replace("./main.ts", "./main.js"));
}

// CLI entry point: `node scripts/build-dashboard.mjs` (what `npm run build` runs).
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const outdir = join(dirname(fileURLToPath(import.meta.url)), "..", "dist");
  await rm(outdir, { recursive: true, force: true });
  await buildDashboard(outdir);
  console.log(`built dashboard -> ${outdir}`);
}
