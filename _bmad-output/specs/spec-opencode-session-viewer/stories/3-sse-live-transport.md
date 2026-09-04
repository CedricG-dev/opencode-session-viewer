---
title: 'SSE live transport'
type: 'feature'
created: '2026-09-04'
status: 'done'
review_loop_iteration: 0
baseline_commit: '160a45630a482d7af60a670f2a62b28ece0e2d33'
context:
  - '{project-root}/_bmad-output/specs/spec-opencode-session-viewer/SPEC.md'
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-opencode-session-viewer-2026-09-03/ARCHITECTURE-SPINE.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The Projector (`core/state-store.ts`) is live, but nothing pushes its state to a browser — CAP-3 (SSE live updates) has zero implementation, and the dashboard (story 4) has no transport to consume.

**Approach:** Add `server/sse.ts` (GET `/event`: snapshot-first connection registration, `broadcast()` for full-replacement per-session deltas, `closeAllConnections()` for dispose) and wire `plugin.ts`'s `Hooks.event` to dispatch each incoming opencode `Event` to the matching `core/state-store.ts` handler, then broadcast that session's freshly-derived `ViewModel`.

## Boundaries & Constraints

**Always:** A new `/event` connection's first `data:` message is the full current snapshot (`getViewModels()`); every later message is one session's full `ViewModel`, never a partial patch (AD-7). `broadcast()` sends the identical payload to every client (AD-6). `server/sse.ts` has no outgoing dependency on `dashboard/` (AD-4). `Hooks.event` never throws — errors are caught and logged via `client.app.log(level:"error")`, same as story 2. `Hooks.dispose()` closes all open SSE connections, in addition to stopping the server.

**Ask First:** none — resolved during planning (see Design Notes).

**Never:** No WebSocket, no polling (AD-1). No independent cost/status computation in `server/` — broadcast only what `core/state-store.getViewModel()` already derived (AD-2, AD-3). No dashboard/client code (story 4).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| New connection | `GET /event` | First `data:` line is the full `ViewModel[]` snapshot | N/A |
| Event for known session | e.g. `session.status` for a known id | Every client receives a `data:` line with that session's full, updated `ViewModel` | N/A |
| Event for unknown session | e.g. `session.status`/`message.updated`, id never created | `state-store` no-ops; no broadcast sent | N/A |
| Two connected clients | One broadcast triggered | Both receive the identical delta (AD-6) | N/A |
| Client disconnects | Stream cancelled/aborted | Client removed from the broadcast set | Enqueue on a closed controller is caught, entry removed |
| Dispose with open connections | `Hooks.dispose()` called | All open SSE connections close; server then stops | N/A |
| `Hooks.event` throws | dispatch/broadcast throws unexpectedly | Hook resolves without throwing | Logged via `client.app.log(level:"error")` |

</frozen-after-approval>

## Code Map

- `src/server/sse.ts` -- NEW: `handleEventRequest(getViewModels): Response` (module-private controller `Set`, snapshot on `start`, removal on `cancel`), `broadcast(viewModel): void`, `closeAllConnections(): void`.
- `src/server/sse.test.ts` -- NEW: `bun:test`, real `ReadableStream`/reader per case (like `http.test.ts`'s real-`Bun.serve` convention), covers the I/O matrix.
- `src/server/http.ts` -- MODIFY: `StartServerOptions` gains `onEventRequest?: (request) => Response`; `fetch()` routes `GET /event` to it before static serving. [`http.ts:14`](../../../../src/server/http.ts#L14)
- `src/server/http.test.ts` -- MODIFY: add a routing-delegation test for `/event`.
- `src/plugin.ts` -- MODIFY: wires `onEventRequest` to `handleEventRequest(getViewModels)`; adds `Hooks.event`, a `switch (event.type)` dispatching `session.created/updated/status/idle/error`/`message.updated` to the matching `state-store` handler, then `broadcast()`s `getViewModel(id)` when defined; `dispose()` calls `closeAllConnections()` then `server.stop(true)` (was `server.stop()`). [`plugin.ts:46,71`](../../../../src/plugin.ts#L46)
- `src/plugin.test.ts` -- MODIFY: add `event`-dispatch/broadcast tests; update `dispose()` tests' fake server to accept `stop(true)`.
- `src/core/state-store.ts` -- MODIFY: `getViewModels()` sorts by `session.time.created` ascending (resolves `deferred-work.md`'s first entry). [`state-store.ts:78`](../../../../src/core/state-store.ts#L78)
- `src/core/state-store.test.ts` -- MODIFY: test asserting creation-time ordering.

## Tasks & Acceptance

**Execution:**
- [x] `src/server/sse.ts` -- add `handleEventRequest`/`broadcast`/`closeAllConnections`
- [x] `src/server/sse.test.ts` -- unit-test the I/O matrix's connection/broadcast/disconnect rows
- [x] `src/server/http.ts` -- add `onEventRequest` routing for `GET /event`
- [x] `src/server/http.test.ts` -- unit-test `/event` delegation
- [x] `src/plugin.ts` -- wire `Hooks.event` dispatch + broadcast, wire `onEventRequest`, update `dispose()`
- [x] `src/plugin.test.ts` -- unit-test event-dispatch and dispose rows
- [x] `src/core/state-store.ts` -- sort `getViewModels()` by `session.time.created`
- [x] `src/core/state-store.test.ts` -- unit-test the new ordering

**Acceptance Criteria:**
- Given `src/server/sse.ts` is statically imported, then it has no `import` from `dashboard/` (AD-4, grep-checkable).
- Given a connected client and a `session.status` event for that session, when the event hook runs, then the client receives a `data:` line whose parsed JSON equals `getViewModel(id)`.
- Given `bunx tsc --noEmit`, then no type errors.

## Design Notes

- **Wire framing:** plain `data: <json>\n\n`, no `id:`/`retry:`/`event:` fields — AD-7's reconnect story is "get a fresh snapshot", no Last-Event-ID resume needed.
- **Dispatch lives in `plugin.ts`, not a new module** (a ~15-line `switch` doesn't earn its own file), calling `state-store`/`sse` directly, no DI: unlike `startServer`/`spawn` (OS boundaries `bun:test`'s `mock.module` can't fake per-file), they're plain in-process modules `plugin.test.ts` can exercise for real.

## Verification

**Commands:**
- `bun test` -- expected: all cases pass
- `bunx tsc --noEmit` -- expected: no type errors

## Suggested Review Order

**SSE connection lifecycle**

- Entry point: snapshot-first registration, guarded so a failed initial send never leaves a stale entry (AD-7, review-round fix).
  [`sse.ts:19`](../../../../src/server/sse.ts#L19)

- `broadcast()`: identical delta to every client, full replacement per session, dead controllers pruned on enqueue failure (AD-6, AD-7).
  [`sse.ts:48`](../../../../src/server/sse.ts#L48)

- `closeAllConnections()`: used by `Hooks.dispose()` to close every open stream, never throws.
  [`sse.ts:61`](../../../../src/server/sse.ts#L61)

**Event dispatch and broadcast wiring**

- `dispatchEvent()`: the `switch` mapping each opencode `Event.type` to its `state-store` handler and returning the affected session id.
  [`plugin.ts:52`](../../../../src/plugin.ts#L52)

- `Hooks.event`: dispatches then broadcasts the freshly-derived `ViewModel`, wrapped so it never throws out of the hook (story 2's non-fatal convention).
  [`plugin.ts:118`](../../../../src/plugin.ts#L118)

- `dispose()`: `closeAllConnections()` now shares the same try/catch as `server.stop(true)` (review-round fix) — force-closes active connections per the architecture's Consistency Conventions.
  [`plugin.ts:128`](../../../../src/plugin.ts#L128)

**HTTP routing**

- `/event` routing: delegates to `onEventRequest` only for `GET`, before falling through to static serving (review-round fix restricts this to `GET`).
  [`http.ts:17`](../../../../src/server/http.ts#L17)

**Snapshot ordering**

- `getViewModels()`: sorts by `session.time.created` ascending with an explicit `id` tie-breaker (resolves `deferred-work.md`'s story-1 item, review-round fix for determinism).
  [`state-store.ts:83`](../../../../src/core/state-store.ts#L83)

**Tests**

- Connection/broadcast/disconnect/header coverage for the new transport.
  [`sse.test.ts:27`](../../../../src/server/sse.test.ts#L27)

- Event-dispatch and `Hooks.event` integration coverage, including the throws-safely and unknown-session rows.
  [`plugin.test.ts:194`](../../../../src/plugin.test.ts#L194)

- `/event` routing delegation, including the non-GET rejection.
  [`http.test.ts:61,75`](../../../../src/server/http.test.ts#L61)

- Creation-time ordering, including the new tie-break case.
  [`state-store.test.ts:300,311`](../../../../src/core/state-store.test.ts#L300)
