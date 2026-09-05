# opencode-session-viewer

A local dashboard for [opencode](https://opencode.ai) that shows live session activity — messages, status, and model usage — in your browser.

## Install the plugin

No manual `npm install` needed — just reference the package in `opencode.json` (project-level) or `~/.config/opencode/opencode.json` (global) using the `[name, options]` tuple form of the `plugin` array:

```json
{
  "plugin": [["@cedricg-dev/opencode-session-viewer", { "port": 4097, "hostname": "127.0.0.1", "autoLaunch": true }]]
}
```

opencode installs npm plugins automatically via Bun at startup (cached under `~/.cache/opencode/node_modules/`), so this is the only step required. On the next opencode session, a local server starts and a dashboard tab opens automatically (unless `autoLaunch` is `false`).

### Configuration options

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `port` | `number` | `0` (OS-assigned) | Local port the dashboard server binds to. |
| `hostname` | `string` | `"127.0.0.1"` | Bind address for the local server. |
| `autoLaunch` | `boolean` | `true` | Whether to automatically open the dashboard in a browser tab on startup. Set to `false` to suppress this and instead find the URL in opencode's logs. |

An option present with the wrong type (e.g. `port` as a string) falls back to its default rather than being coerced. Config is read once at startup and never re-read mid-run.

Setting `hostname` to a non-default, non-loopback value (e.g. `"0.0.0.0"`) exposes the dashboard to your network with no authentication — only do this deliberately.

If the configured port is invalid or already in use, the server fails to start gracefully: opencode's own startup is never blocked, but a `level:"error"` entry is logged — check opencode's logs if the dashboard doesn't come up.

## Development setup

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

### About `dist/`

The plugin's server (`src/server/http.ts`) serves the dashboard's static frontend (HTML/JS/CSS) from a `dist/` folder next to `src/` (resolved via `resolveStaticDir()` in `src/plugin.ts`). This folder is:

- **git-ignored** — it's build output, not source.
- **generated** by `bun run build`, which bundles `src/dashboard/index.html` and its dependencies.
- **required at runtime** — without it, the plugin has no UI to serve.
- **required at publish time** — `npm publish` automatically runs `bun run build` first (`prepublishOnly` script) so `dist/` is fresh and included in the published package (see `files` in `package.json`).

### Trying local changes in opencode

To point a local opencode project at your working copy instead of the published npm package, reference it by absolute path in `opencode.json`:

```json
{
  "plugin": [["file:///absolute/path/to/opencode-session-viewer", { "autoLaunch": true }]]
}
```

Remember to run `bun run build` after frontend changes — opencode doesn't rebuild `dist/` for you.

## Publishing

See [PUBLISHING.md](./PUBLISHING.md) for how releases are versioned, tagged, and published via GitHub Actions.
