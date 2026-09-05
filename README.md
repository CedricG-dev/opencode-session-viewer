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


