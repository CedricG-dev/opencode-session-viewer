---
title: 'Local server and auto-launch'
type: 'feature'
created: '2026-09-04'
status: 'done'
review_loop_iteration: 0
baseline_commit: '2a616c76c17b5d8da68d56b2dc8d0fd2cff86d2c'
context:
  - '{project-root}/_bmad-output/specs/spec-opencode-session-viewer/SPEC.md'
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-opencode-session-viewer-2026-09-03/ARCHITECTURE-SPINE.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** No entry point exists yet that starts a local server or opens a browser — CAP-1 (auto-launch) has zero implementation, and nothing else in the plugin (SSE, dashboard, config) can be wired up without it.

**Approach:** Add `server/http.ts`'s `startServer()` (`Bun.serve` + static asset serving from `dist/`) and `plugin.ts`'s factory (calls `startServer`, best-effort opens the OS browser to the bound URL, wires `Hooks.dispose` to stop the server) — server-start and browser-open failures are caught and logged via `client.app.log()`, never thrown out of the factory.

## Boundaries & Constraints

**Always:** Server-bind and browser-open failures are caught in the factory and logged via `client.app.log()` — never thrown out of the factory (CAP-1; opencode startup must never be blocked). Default bind hostname is `127.0.0.1`. `dispose()` stops the server when one started; safe no-op otherwise. `server/http.ts` has zero outgoing dependency on `core/` (AD-4, transitively). Logging uses `client.app.log()` only, never `console.log`.

**Ask First:** none — resolved during planning (see Design Notes).

**Never:** No reading of `options.port`/`options.hostname`/`options.autoLaunch` in this story — that's Story 5 (AD-5); hardcode literals here. No `Hooks.event`/session-state wiring (Story 3). No dashboard build output assumed to exist — missing files 404, never throw.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Plugin loads normally | Factory invoked, port free | Server starts; browser opens to the bound URL; `dispose()` stops the server | N/A |
| Requested static file exists | `GET /index.html` present under `dist/` | `200` with file content | N/A |
| Requested file missing / `dist/` absent | `GET` any path, no matching file | `404` response | N/A |
| Server bind fails | `Bun.serve` throws | Factory still returns `Hooks`, does not throw | `client.app.log()` called with `level:"error"` |
| Browser fails to open | Spawn of the OS opener throws/ENOENT | Server keeps running; factory does not throw | `client.app.log()` called with `level:"warn"` |
| `dispose()` called after a failed start | No server was ever started | Resolves without throwing | N/A |

</frozen-after-approval>

## Code Map

- `src/server/http.ts` -- NEW: `startServer({ hostname, port, staticDir }): Bun.Server` via `Bun.serve` (returns a `Server` with `.url: URL`, `.port`, `.stop(closeActiveConnections?): Promise<void>` — `node_modules/bun-types/serve.d.ts:945,1184`). `/` maps to `index.html`; any path resolves via `Bun.file(staticDir + pathname)`, `404` when `.exists()` is `false`.
- `src/plugin.ts` -- NEW: default export typed `Plugin` from `@opencode-ai/plugin` (`(input, options?) => Promise<Hooks>` — `node_modules/@opencode-ai/plugin/dist/index.d.ts:36-51`). Calls `startServer` with hardcoded `{ hostname: "127.0.0.1", port: 0, staticDir: <sibling dist/, see Design Notes> }`; on success, best-effort spawns the OS browser opener against `server.url`; start and open are both wrapped in try/catch logging via `client.app.log({ body: { service, level, message } })` (`node_modules/@opencode-ai/sdk/dist/gen/types.gen.d.ts:2842-2867`) — never rethrows. Returns `Hooks` with `dispose` stopping the server if one started.
- `src/server/http.test.ts` -- NEW: `bun:test`, same conventions as `src/core/state-store.test.ts` — real `Bun.serve` on port `0`, `fetch()` against `server.url`, fixtures via `Bun.write` into a temp dir for the static-serving rows.
- `src/plugin.test.ts` -- NEW: unit-tests the extracted pure `resolveOpenCommand(platform, url)` helper (one case per `darwin`/`win32`/other), plus the bind-failure and open-failure rows using a stub `client` capturing `app.log()` calls.

## Tasks & Acceptance

**Execution:**
- [x] `src/server/http.ts` -- add `startServer()` -- `Bun.serve` + static file serving from `dist/`, per Design Notes
- [x] `src/plugin.ts` -- add the `Plugin` factory (default export) -- wires `startServer`, best-effort browser open, non-fatal error logging, `dispose`
- [x] `src/server/http.test.ts` -- unit-test the I/O matrix's static-serving rows
- [x] `src/plugin.test.ts` -- unit-test the I/O matrix's start/open/dispose-failure rows plus `resolveOpenCommand`

**Acceptance Criteria:**
- Given `src/plugin.ts` is statically imported, then it has no `import` from any `core/` or `dashboard/` path (AD-4, grep-checkable).
- Given the factory started a server successfully, when `Hooks.dispose()` is invoked, then the underlying Bun server is stopped and no error is thrown.
- Given `bunx tsc --noEmit`, then no type errors.

## Design Notes

- **Static dir resolution:** `new URL("../dist", import.meta.url)` from `src/plugin.ts` (project-root `dist/`), matching the architecture Structural Seed (`dist/` = Bun.build output, gitignored). `dist/` won't exist until Story 4 ships the dashboard bundle — `Bun.file(...).exists()` returns `false` for a missing parent directory too, so every request 404s gracefully until then; expected, not a bug.
- **Port:** hardcoded `0` (OS-assigned free port) for this story — sidesteps "port already in use" entirely for the default case. Story 5 swaps this literal for `options.port ?? 0`.
- **Browser open:** no new dependency — spawn the platform's native opener directly via `Bun.spawn` (`open` on darwin, `cmd /c start "" <url>` on win32, `xdg-open` elsewhere), fire-and-forget, wrapped in try/catch.

## Verification

**Commands:**
- `bun test src/server/http.test.ts src/plugin.test.ts` -- expected: all cases pass
- `bunx tsc --noEmit` -- expected: no type errors

## Suggested Review Order

**Auto-launch orchestration**

- Entry point: the DI-based factory core — why `startServer`/`spawn` are plain-parameter dependencies, not module mocks (bun:test's `mock.module` leaks across files).
  [`plugin.ts:46`](../../../../src/plugin.ts#L46)

- Non-fatal server-start failure: the whole story's CAP-1 invariant — never throw out of the factory.
  [`plugin.ts:50`](../../../../src/plugin.ts#L50)

- Best-effort browser open: `stdio: ["ignore",...]` avoids a documented Bun.spawn gotcha (keeping opencode alive), plus async exit-code monitoring for failures `Bun.spawn` doesn't throw synchronously for.
  [`plugin.ts:56`](../../../../src/plugin.ts#L56)

- `dispose()` holds itself to the same non-throwing standard as startup (review-round addition).
  [`plugin.ts:71`](../../../../src/plugin.ts#L71)

- `resolveStaticDir()`: the `dist/` path this story's static serving depends on — extracted so the real computation (not a test's stub) is directly asserted.
  [`plugin.ts:31`](../../../../src/plugin.ts#L31)

- `resolveOpenCommand()`: pure per-platform command selection, no dependency added.
  [`plugin.ts:6`](../../../../src/plugin.ts#L6)

- `log()`/`formatError()`: logging never itself throws; stack traces preserved for diagnosability (review-round addition).
  [`plugin.ts:18`](../../../../src/plugin.ts#L18)

**Static asset serving**

- `startServer()`: `Bun.serve` + `Bun.file` static serving — `/` → `index.html`, missing file/dir → `404`, never throws.
  [`http.ts:14`](../../../../src/server/http.ts#L14)

**Tests**

- Full I/O-matrix coverage plus the review-round additions (exit-code monitoring, dispose failure, `resolveStaticDir`).
  [`plugin.test.ts:60`](../../../../src/plugin.test.ts#L60)

- Static-serving rows: file hit, `/` → `index.html`, missing file, missing `staticDir`.
  [`http.test.ts:21`](../../../../src/server/http.test.ts#L21)
</content>
