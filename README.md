# opencode-session-viewer

## Configuration

Configure the plugin via the `[name, options]` tuple form of `opencode.json`'s `plugin` array:

```json
{
  "plugin": [["opencode-session-viewer", { "port": 4097, "hostname": "127.0.0.1", "autoLaunch": true }]]
}
```

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `port` | `number` | `0` (OS-assigned) | Local port the dashboard server binds to. |
| `hostname` | `string` | `"127.0.0.1"` | Bind address for the local server. |
| `autoLaunch` | `boolean` | `true` | Whether to automatically open the dashboard in a browser tab on startup. Set to `false` to suppress this and instead find the URL in opencode's logs. |

An option present with the wrong type (e.g. `port` as a string) falls back to its default rather than being coerced. Config is read once at startup and never re-read mid-run.

Setting `hostname` to a non-default, non-loopback value (e.g. `"0.0.0.0"`) exposes the dashboard to your network with no authentication — only do this deliberately.

If the configured port is invalid or already in use, the server fails to start gracefully: opencode's own startup is never blocked, but a `level:"error"` entry is logged — check opencode's logs if the dashboard doesn't come up.

## Installation

```bash
npm install @cedricg-dev/opencode-session-viewer
```

## Development

1. Clone the repository
2. Install dependencies: `npm install`
3. Build: `npm run build`
4. Test: `npm test`
