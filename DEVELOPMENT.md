# Development

This project uses [Bun](https://bun.sh) for running, testing, and building.

1. Clone the repository and install dependencies:
   ```bash
   git clone https://github.com/CedricG-dev/opencode-session-viewer.git
   cd opencode-session-viewer
   bun install
   ```
2. Run the tests:
   ```bash
   bun test
   ```
3. Build the dashboard frontend into `dist/` (required before the plugin can serve the UI — see below):
   ```bash
   bun run build
   ```

## About `dist/`

The plugin's server (`src/server/http.ts`) serves the dashboard's static frontend (HTML/JS/CSS) from a `dist/` folder next to `src/` (resolved via `resolveStaticDir()` in `src/plugin.ts`). This folder is:

- **git-ignored** — it's build output, not source.
- **generated** by `bun run build`, which bundles `src/dashboard/index.html` and its dependencies.
- **required at runtime** — without it, the plugin has no UI to serve.
- **required at publish time** — `npm publish` automatically runs `bun run build` first (`prepublishOnly` script) so `dist/` is fresh and included in the published package (see `files` in `package.json`).

## Trying local changes in opencode

To point a local opencode project at your working copy instead of the published npm package, reference it by absolute path in `opencode.json`:

```json
{
  "plugin": [["file:///absolute/path/to/opencode-session-viewer", { "autoLaunch": true }]]
}
```

Remember to run `bun run build` after frontend changes — opencode doesn't rebuild `dist/` for you.

## Publishing

See [PUBLISHING.md](./PUBLISHING.md) for how releases are versioned, tagged, and published via GitHub Actions.
</content>
