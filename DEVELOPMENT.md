# Development

This guide covers setting up a local development environment for `opencode-session-viewer`,
including how to point a local opencode project at your working copy via `opencode.json`.

## Prerequisites

- **Node.js** >= 18.0.0 ([download](https://nodejs.org/)) — the plugin uses Node built-ins
  (`node:http`, `node:fs`, `node:child_process`, `node:url`, `node:os`, `node:path`) so it works
  under both Node and the Bun runtime opencode itself bundles.
- **Git** ([download](https://git-scm.com/))
- **opencode** — install globally:
  ```bash
  npm install -g opencode-ai
  ```

## Project Setup

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

## Setup local plugin in project

Copy the example config and adjust it for your machine:

```bash
cp opencode.json.example opencode.json
```

To point a local opencode project at your working copy instead of the published npm package, reference it by absolute path in `opencode.json` (project-level or `~/.config/opencode/opencode.json` for global):

```json
{
  "plugin": [["file:///absolute/path/to/opencode-session-viewer", { "autoLaunch": true }]]
}
```

`opencode.json` is git-ignored (it typically contains a machine-specific absolute path) — `opencode.json.example` is the tracked template.

Remember to run `npm run build` after frontend changes — opencode doesn't rebuild `dist/` for you.

Start opencode as usual from the project directory:

```bash
opencode
```

On startup, a local server binds to `hostname`/`port` (see [README.md](./README.md#configuration-options) for the full option list) and, unless `autoLaunch` is `false`, opens a browser tab to the dashboard.

## Running multiple opencode instances

If you run several opencode instances against the same project, only the first one binds the dashboard server; subsequent instances detect the existing server via a lock file (`opencode-session-viewer.lock` in the OS temp directory) and forward their events to it instead of starting a second server or opening a second tab. See `src/server/lock.ts` and `plugin.ts`'s `/ingest` wiring for details.

## Logging

`src/plugin.ts` traces server start/stop/join and start failures into opencode's own log file via
`client.app.log(...)` (`service: "opencode-session-viewer"`), so `grep opencode-session-viewer` on
opencode's log file (see opencode's docs for its location) shows what happened without needing a
debugger attached.

## Troubleshooting

### Dashboard doesn't open

1. Confirm `opencode.json` is at the project root (or `~/.config/opencode/opencode.json` for global installs) and references the plugin correctly.
2. Check opencode's own log file for `opencode-session-viewer` entries — a bind failure or thrown error is logged there, never silently swallowed.
3. If `autoLaunch` is `false`, the dashboard URL is only in the logs — find it and open it manually.

### Port already in use

Set an explicit, free `port` in `opencode.json`, or leave it unset (default `0`) to let the OS assign one automatically. An invalid or in-use configured port fails gracefully — opencode's own startup is never blocked.

## 🔄 Git Workflow: `Simplified GitFlow`

We use a streamlined `GitFlow` with 2 main branches:

| Branch      | Purpose                                                    | Protection (GitHub) |
|-------------|-------------------------------------------------------------|----------------------|
| `main`      | **Production**: Stable, versioned, and published to NPM.    | ✅ Protected         |
| `develop`   | **Integration**: Validated features, ready for release.     | ✅ Protected         |
| `feature/*` | **Development**: New features (e.g., `feature/ai-hints`).   | ❌ Free              |
| `fix/*`     | **Hotfixes**: Bug fixes (e.g., `fix/token-leak`).            | ❌ Free              |

## Versioning: Semantic Versioning (SemVer)

We follow `MAJOR.MINOR.PATCH`:

- **MAJOR**: Breaking changes.
- **MINOR**: Backward-compatible feature additions.
- **PATCH**: Backward-compatible bug fixes.
