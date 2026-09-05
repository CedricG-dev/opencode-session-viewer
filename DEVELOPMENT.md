# Development

This project uses npm for running, testing, and building. (opencode itself still loads the
published plugin via its own bundled Bun runtime at install/run time — see `src/plugin.ts` and
`src/server/http.ts`, which only use Node built-ins for exactly that reason: they run fine under
either runtime.)

1. Clone the repository and install dependencies:
   ```bash
   git clone https://github.com/CedricG-dev/opencode-session-viewer.git
   cd opencode-session-viewer
   npm install
   ```
2. Run the tests:
   ```bash
   npm test
   ```
3. Build the dashboard frontend into `dist/` (required before the plugin can serve the UI — see below):
   ```bash
   npm run build
   ```

## About `dist/`

The plugin's server (`src/server/http.ts`) serves the dashboard's static frontend (HTML/JS/CSS) from a `dist/` folder next to `src/` (resolved via `resolveStaticDir()` in `src/plugin.ts`). This folder is:

- **git-ignored** — it's build output, not source.
- **generated** by `npm run build` (`scripts/build-dashboard.mjs`, esbuild), which bundles `src/dashboard/main.ts` and its dependencies.
- **required at runtime** — without it, the plugin has no UI to serve.
- **required at publish time** — `npm publish` automatically runs `npm run build` first (`prepublishOnly` script) so `dist/` is fresh and included in the published package (see `files` in `package.json`).

## Trying local changes in opencode

To point a local opencode project at your working copy instead of the published npm package, reference it by absolute path in `opencode.json`:

```json
{
  "plugin": [["file:///absolute/path/to/opencode-session-viewer", { "autoLaunch": true }]]
}
```

Remember to run `npm run build` after frontend changes — opencode doesn't rebuild `dist/` for you.

## Logging

`src/plugin.ts` traces server start/stop/join and start failures into opencode's own log file via
`client.app.log(...)` (`service: "opencode-session-viewer"`), so `grep opencode-session-viewer` on
opencode's log file (see opencode's docs for its location) shows what happened without needing a
debugger attached.

## Publishing

See [PUBLISHING.md](./PUBLISHING.md) for how releases are versioned, tagged, and published via GitHub Actions.
</content>
