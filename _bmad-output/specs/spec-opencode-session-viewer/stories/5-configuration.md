---
title: 'Configuration'
type: 'feature'
created: '2026-09-04'
status: 'done'
review_loop_iteration: 0
baseline_commit: 'ad4190a39079afbb050e4ee9f11f5da036bafd8a'
context:
  - '{project-root}/_bmad-output/specs/spec-opencode-session-viewer/SPEC.md'
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-opencode-session-viewer-2026-09-03/ARCHITECTURE-SPINE.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** `plugin.ts` hardcodes `hostname: "127.0.0.1"` and `port: 0`, and always spawns the browser opener — `opencode.json`'s `[name, options]` tuple (CAP-5/AD-5) is never read, so users can't configure port, bind address, or disable auto-launch.

**Approach:** Add a pure `resolveConfig(options)` helper in `plugin.ts` that reads `port`/`hostname`/`autoLaunch` from the factory's `options` argument with type-checked fallback to documented defaults, wire its output into the existing `deps.startServer` call, and skip the browser-opener spawn (logging the reachable URL instead) when `autoLaunch` resolves to `false`.

## Boundaries & Constraints

**Always:** Config is read once, synchronously, at factory invocation (AD-5) — never re-read mid-run. Defaults: `hostname` `"127.0.0.1"`, `port` `0` (OS-assigned, unchanged from story 2), `autoLaunch` `true`. An option present with the wrong runtime type (e.g. `port` as a string) falls back to that field's default rather than being coerced. Port-conflict/invalid-port failures stay graceful via the existing `try/catch` around `deps.startServer` (already logs `level:"error"` and leaves opencode startup unblocked) — no new port-validation or retry logic.

**Ask First:** none.

**Never:** No re-reading config after startup. No independent port-availability pre-check before calling `deps.startServer` (redundant with the existing catch). No new config file/env-var source — `options` only (AD-5).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| No options given | `options` is `undefined` | `{port:0, hostname:"127.0.0.1", autoLaunch:true}` — unchanged story-2 behavior | N/A |
| Valid options supplied | `{port:4097, hostname:"0.0.0.0", autoLaunch:false}` | Those exact values passed to `deps.startServer`/branch logic | N/A |
| Wrong-typed option | `{port:"4097"}` | `port` falls back to `0`; other fields resolve independently | N/A |
| `autoLaunch:false`, bind succeeds | `server` truthy | `deps.spawn` never called; `level:"info"` log names the reachable URL | N/A |
| Configured port invalid/in use | `deps.startServer` throws | Factory resolves without throwing; `level:"error"` logged; startup not blocked | Existing try/catch (unchanged) |

</frozen-after-approval>

## Code Map

- `src/plugin.ts` -- `createHandler`'s returned factory currently ignores the `options` second argument (`Plugin = (input, options?) => Promise<Hooks>`); `startServer`/spawn calls are at lines ~92 and ~106; `log()` currently types `level` as `"error" | "warn"` only.
- `src/plugin.test.ts` -- existing `describe("plugin factory", ...)` block builds `deps`/`makeClient()` fixtures and calls `createHandler(deps)({ client } as PluginInput)` without a second argument; extend these patterns rather than inventing new ones.
- `README.md` -- currently only a title; add the config section here.

## Tasks & Acceptance

**Execution:**
- [x] `src/plugin.ts` -- add exported `resolveConfig(options: PluginOptions | undefined)` pure helper (type-checked fallback per field) -- isolates config resolution so it's unit-testable without a `PluginInput`/server
- [x] `src/plugin.ts` -- accept `options?: PluginOptions` in the returned factory, call `resolveConfig`, pass `config.hostname`/`config.port` to `deps.startServer` -- closes the AD-5 wiring gap
- [x] `src/plugin.ts` -- branch on `config.autoLaunch`: unchanged spawn path when `true`; when `false`, skip `deps.spawn` and `log(client, "info", ...)` the server's URL instead -- satisfies the "manual way to reach it" consequence without a new log level path being needed elsewhere
- [x] `src/plugin.ts` -- widen `log()`'s `level` param to `"error" | "warn" | "info"`
- [x] `src/plugin.test.ts` -- add `describe("resolveConfig", ...)` covering the I/O matrix's default/valid/wrong-typed rows
- [x] `src/plugin.test.ts` -- extend `describe("plugin factory", ...)` with: options reach `deps.startServer` verbatim; `autoLaunch:false` skips spawn and logs `level:"info"` with the URL
- [x] `README.md` -- add a "## Configuration" section documenting `port`/`hostname`/`autoLaunch`, their defaults, and the `opencode.json` `"plugin": [["opencode-session-viewer", { "port": 4097 }]]` tuple form (AD-5)

**Acceptance Criteria:**
- Given `opencode.json` supplies `{port, hostname, autoLaunch}` for this plugin, when the factory runs, then `deps.startServer` receives exactly those values.
- Given no options are supplied, when the factory runs, then behavior is unchanged from story 2 (bind `127.0.0.1`, OS-assigned port, browser opens).
- Given `autoLaunch:false` and a successful bind, when the factory runs, then no subprocess is spawned and a `level:"info"` log names the reachable URL.
- Given `bunx tsc --noEmit`, then no type errors.

## Spec Change Log

## Design Notes

Default port stays `0` (OS-assigned) rather than a fixed number — preserves story 2's guarantee that an unconfigured install never collides with anything, and keeps "invalid/busy port" handling entirely inside the `try/catch` that already exists around `deps.startServer`, instead of adding bespoke pre-validation or retry code that CAP-5's success criteria don't actually require.

## Verification

**Commands:**
- `bun test src/plugin.test.ts` -- expected: all cases pass, including the new `resolveConfig`/`autoLaunch:false` coverage
- `bunx tsc --noEmit` -- expected: no type errors

## Suggested Review Order

**Config resolution (resolveConfig)**

- Entry point: pure per-field type-checked fallback — the core of this story's AD-5 wiring.
  [`plugin.ts:51`](../../../../src/plugin.ts#L51)

- Defaults are named once and reused by both the resolver and its doc comment.
  [`plugin.ts:40`](../../../../src/plugin.ts#L40)

**Wiring into the factory**

- `options?: PluginOptions` now reaches the factory and feeds `resolveConfig` — previously ignored entirely.
  [`plugin.ts:113`](../../../../src/plugin.ts#L113)

- Resolved `hostname`/`port` replace the two hardcoded story-2 values passed to `deps.startServer`.
  [`plugin.ts:118`](../../../../src/plugin.ts#L118)

- `autoLaunch` branch: skips the browser-opener spawn and logs the URL instead — the "manual way to reach it" consequence (PRD FR-5).
  [`plugin.ts:128`](../../../../src/plugin.ts#L128)

- `log()`'s `level` widened to admit `"info"`, used only by the new branch above.
  [`plugin.ts:60`](../../../../src/plugin.ts#L60)

**Graceful failure (unchanged, now reachable via a configured port)**

- Existing `try/catch` around `deps.startServer` is the sole mechanism for "invalid/busy port fails gracefully" — no new validation code was added here by design (see Design Notes).
  [`plugin.ts:117`](../../../../src/plugin.ts#L117)

**Docs**

- Configuration section: options table, tuple-form example, and the non-loopback/invalid-port caveats added during review.
  [`README.md`](../../../../README.md)

**Tests**

- `resolveConfig` coverage: defaults, valid values, and a wrong-typed case for each of the three fields independently.
  [`plugin.test.ts:98`](../../../../src/plugin.test.ts#L98)

- Factory-level coverage: options reach `deps.startServer` verbatim, and `autoLaunch:false` skips spawn and logs the URL.
  [`plugin.test.ts:165`](../../../../src/plugin.test.ts#L165)
