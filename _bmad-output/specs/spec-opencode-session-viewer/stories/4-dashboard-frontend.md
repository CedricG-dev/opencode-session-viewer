---
title: 'Dashboard frontend'
type: 'feature'
created: '2026-09-04'
status: 'done'
review_loop_iteration: 1
baseline_commit: '084f3702831a3e1085d2d20a2b4d1eab58a62a34'
context:
  - '{project-root}/_bmad-output/specs/spec-opencode-session-viewer/SPEC.md'
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-opencode-session-viewer-2026-09-03/ARCHITECTURE-SPINE.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The backend (stories 1–3) is fully live, but nothing renders it — CAP-2/3/4's UI half has zero implementation, and `dist/` (served since story 2) doesn't exist.

**Approach:** Add `src/dashboard/{main.tsx,store.ts,components/}` — a Preact + `@preact/signals` view connecting to `GET /event` via `EventSource`, storing received view models in a signal, pure-rendering a session list/row, an aggregate cost total, and a disconnected indicator. Add `src/dashboard/index.html` as the `Bun.build` entrypoint and a `build` script producing `dist/`.

## Boundaries & Constraints

**Always:** `store.ts` only stores/replaces `ViewModel[]` and sums per-session `cost` for the total — never a new derived fact (AD-2). Snapshot (JSON array) replaces the whole list; delta (single object) replaces that one session by `id` (AD-7). Session text (`title`, `errorMessage`) renders only via `htm/preact`'s auto-escaping — no `dangerouslySetInnerHTML`. `store.ts` only toggles `connected` on `onopen`/`onerror`; reconnect itself is `EventSource`'s native retry (AD-7). No outgoing dependency on `server/` internals (AD-4).

**Ask First:** none.

**Never:** No WebSocket/polling (AD-1). No independent cost/status computation (AD-2/3). No JSX syntax/compiler flag — `htm/preact` tagged templates only, despite `.tsx` extensions (Design Notes).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Connection opens/drops | `onopen`/`onerror` fires | `connected` toggles `true`/`false`; indicator shows only when `false` | N/A |
| Snapshot | payload is a JSON array | `sessions` fully replaced with it | N/A |
| Delta | payload is one JSON object with `id` | That `id`'s entry replaced; others untouched; unknown `id` appended | N/A |
| `errorFlag:true` session | `SessionRow` render | `errorMessage` shown, auto-escaped | N/A |
| N sessions | `AggregateTotal` render | Equals sum of each `cost`, live-updating | N/A |

</frozen-after-approval>

## Code Map

- `package.json` -- MODIFY: add deps `preact@^10.29.8`, `@preact/signals@^2.11.1`, `htm@^3.1.1`; add `"build": "bun build ./src/dashboard/index.html --outdir ./dist"`.
- `tsconfig.json` -- MODIFY: add `"lib": ["ESNext", "DOM"]` for `document`/`EventSource` — `bun-types` (`globals.d.ts`'s `LibDomIsLoaded`) is built to coexist with `dom` lib alongside `"types": ["bun"]`. **No `jsx`/`jsxImportSource` flags** — every `dashboard/` file is `.ts` (round-1 fix), so TS never needs to resolve a `.tsx` module (confirmed: TS6142 triggers on `.tsx` resolution regardless of contained syntax; a `.ts` file never hits it).
- `src/dashboard/store.ts` -- NEW: `sessions`/`connected` signals, `aggregateCost` computed, `connect(EventSourceCtor?)` (DI mirrors `plugin.ts`'s `PluginDeps`). `onmessage` wraps `JSON.parse` in try/catch (malformed payload logged/dropped, matches `plugin.ts`'s defensive convention) — **all `.ts`, not `.tsx` (round-1 fix, see Spec Change Log)**.
- `src/dashboard/store.test.ts` -- NEW: `bun:test`, fake `EventSource`, covers the I/O matrix rows + the malformed-payload guard.
- `src/dashboard/components/SessionRow.ts` -- NEW: one `<tr>` per `ViewModel` — title, status, messageCount, lastActivity, **tokens**, cost (`.toFixed(4)`), and an error `<td>` **always present** (empty string when `errorFlag` is `false`, so every row has the same column count).
- `src/dashboard/components/AggregateTotal.ts` -- NEW: renders `aggregateCost` (`.toFixed(4)`).
- `src/dashboard/components/DisconnectedIndicator.ts` -- NEW: renders only when `connected.value` is `false`.
- `src/dashboard/components/components.test.ts` -- NEW: `bun:test` on returned vnode shape (no DOM) -- branch rows above; `AggregateTotal`'s test asserts the full rendered text, not a loose `toContain`.
- `src/dashboard/main.ts` -- NEW: calls `connect()`, `render()`s `App` (incl. a `<thead>` header row naming each column) into `#app`, using `core/view-model.ts`'s `ViewModel` type.
- `src/dashboard/index.html` -- NEW: `Bun.build` HTML entrypoint, `<div id="app">` + `<script type="module" src="./main.ts">`.
- `src/dashboard/integration.test.ts` -- NEW: `bun:test`, real `startServer`+`handleEventRequest` (per `sse.test.ts`/`http.test.ts` convention) + real `connect()` against it, asserting a broadcast reaches `sessions.value` — closes the gap where `/event` could drift between client and server undetected.

## Tasks & Acceptance

**Execution:**
- [x] `package.json` -- add deps + `build` script -- run `bun install`
- [x] `tsconfig.json` -- add `"lib": ["ESNext", "DOM"]` only (no `jsx`/`jsxImportSource`)
- [x] `src/dashboard/store.ts` + `store.test.ts` -- signals, `connect()` (with malformed-payload guard), I/O matrix coverage
- [x] `src/dashboard/components/*.ts` + `components.test.ts` -- pure render + branch coverage, consistent column count, formatted cost
- [x] `src/dashboard/main.ts`, `index.html` -- mount `App` (with `<thead>`), HTML entrypoint
- [x] `src/dashboard/integration.test.ts` -- real server + real `connect()` round-trip
- [x] `bun run build` -- verify `dist/index.html` + bundled JS are produced and served at `/` (round-2 fix: script now cleans `dist/` first)
- [x] `src/dashboard/main.test.ts` (round-2 patch) -- `<thead>`/`<td>` column-order parity + empty-state row
- [x] `src/dashboard/build.test.ts` (round-2 patch) -- runs the real `Bun.build` call against a temp dir, serves it, asserts `200`

**Acceptance Criteria:**
- Given `src/dashboard/` is statically imported, then it imports nothing from `server/` internals (AD-4, grep-checkable) — only `core/view-model.ts`'s types.
- Given `bun run build` then the server started, when a browser requests `/`, then it gets the built dashboard HTML, not a 404.
- Given `bunx tsc --noEmit`, then no type errors.
- Given `SessionRow` renders for any `ViewModel`, then it always emits the same number of `<td>` cells regardless of `errorFlag`.

## Spec Change Log

- **Review round 1 (bad_spec, no frozen-intent change):** Blind Hunter / Edge Case Hunter / Verification Gap review found: (1) the implementation added `tsconfig.json`'s `jsx`/`jsxImportSource` flags, directly violating the frozen Never-clause ("No JSX syntax/compiler flag") — root cause was this spec's own Code Map specifying `.tsx` extensions for zero-JSX `htm` files; independently confirmed via isolated repro that TypeScript's `--jsx` requirement (`TS6142`) triggers on any `.tsx` module *resolution*, regardless of contained syntax, but never on `.ts`. Fixed by changing every `dashboard/` file to `.ts` — the frozen constraint is fully satisfiable as originally written, no renegotiation needed. (2) `SessionRow`'s Code Map omitted `tokens`, contradicting SPEC.md CAP-4's explicit "shows each Session's token usage and dollar Cost" — added a tokens cell. (3) Folded in from the same review pass: `onmessage`'s `JSON.parse` now guarded (try/catch, matches `plugin.ts`'s convention); `SessionRow` always renders the same cell count (error `<td>` present-but-empty when `errorFlag` is `false`) instead of a variable one; a `<thead>` header row added; `cost`/`aggregateCost` formatted via `.toFixed(4)`; `AggregateTotal`'s test strengthened past a loose `toContain`; one integration test added asserting `connect()`'s `/event` URL actually matches `server/http.ts`'s route (previously untested end-to-end). **KEEP:** the `connect(EventSourceCtor?)` DI pattern mirroring `plugin.ts`'s `PluginDeps`, `applyPayload`'s `Array.isArray` snapshot/delta discriminator, and testing components via direct vnode inspection (no DOM) all worked well and are unchanged. Not addressed (logged to `deferred-work.md`): ARIA live region, viewport meta tag, build minification/hashing, `lastActivity` human-formatting, and defensive parsing of an out-of-contract SSE payload shape (currently guaranteed well-formed by the single, typed backend writer).

## Design Notes

- **Resolves review F9** (`htm` dep vs. `.tsx` Structural Seed filenames): `htm/preact`'s tagged-template `html` function only, no `<Foo>` JSX syntax. **Round-1 correction:** every `dashboard/` file is `.ts`, not `.tsx` — a zero-JSX `.tsx` file still forces TS to require `--jsx` on resolution (`TS6142`, confirmed by repro), which the frozen Never-clause forbids; `.ts` avoids the flag entirely with identical runtime behavior.
- **Snapshot-vs-delta**: `sse.ts` always frames a snapshot as an array, a delta as one object — `Array.isArray(JSON.parse(e.data))` discriminates reliably.
- **Signals reactivity**: `@preact/signals`' Preact bindings auto-subscribe any component reading `.value` during render — no `useSignal`/HOC needed.

## Verification

**Commands:**
- `bun install` -- expected: `preact`/`@preact/signals`/`htm` added
- `bun test src/dashboard` -- expected: all cases pass
- `bunx tsc --noEmit` -- expected: no type errors
- `bun run build` -- expected: `dist/index.html` + bundled JS produced

## Suggested Review Order

**Client-side Projector mirror (store.ts)**

- Entry point: snapshot-vs-delta discrimination, this story's core state-merge logic (AD-7).
  [`store.ts:18`](../../../../src/dashboard/store.ts#L18)

- `connect()`: DI mirrors `plugin.ts`'s `PluginDeps`; `onmessage`'s try/catch guards a malformed payload without crashing the connection (round-1 fix).
  [`store.ts:41`](../../../../src/dashboard/store.ts#L41)

**Rendering: column consistency and the common empty state**

- `App()`: `<thead>` labels this story's column contract; the empty-state row is the *common* initial view (CAP-1 opens before any session exists), not an edge case (round-2 fix).
  [`main.ts:10`](../../../../src/dashboard/main.ts#L10)

- Bootstrap guarded behind `typeof document` so `App` is importable/testable without a real `EventSource`/DOM (round-2 fix, found while adding `main.test.ts`).
  [`main.ts:41`](../../../../src/dashboard/main.ts#L41)

- `SessionRow`: always 7 cells regardless of `errorFlag` (round-1 fix, was a variable count); text fields auto-escape via `htm/preact` (untrusted session content).
  [`SessionRow.ts:10`](../../../../src/dashboard/components/SessionRow.ts#L10)

- `AggregateTotal` / `DisconnectedIndicator`: trivial display-only sum (AD-2) and connection-state toggle (AD-7), respectively.
  [`AggregateTotal.ts:5`](../../../../src/dashboard/components/AggregateTotal.ts#L5)
  [`DisconnectedIndicator.ts:5`](../../../../src/dashboard/components/DisconnectedIndicator.ts#L5)

**Build & serving**

- `.ts`, not `.tsx`, everywhere in `dashboard/` -- avoids a `--jsx` compiler flag the frozen intent forbids, without any JSX syntax change (round-1 root-cause fix, see Spec Change Log).
  [`tsconfig.json:8`](../../../../tsconfig.json#L8)

- `build` script cleans `dist/` first so repeated builds don't accumulate orphaned content-hashed bundles (round-2 fix).
  [`package.json:8`](../../../../package.json#L8)

- `Bun.build` HTML entrypoint -- `dist/index.html` is what `server/http.ts` has been serving (404-ing) since story 2.
  [`index.html`](../../../../src/dashboard/index.html)

**Tests**

- Full I/O-matrix coverage plus the malformed-payload guard.
  [`store.test.ts:50`](../../../../src/dashboard/store.test.ts#L50)

- Component branch coverage: 7-cell consistency, cost/token formatting, connected/disconnected.
  [`components.test.ts:36`](../../../../src/dashboard/components/components.test.ts#L36)

- `<thead>`/`<td>` column-order parity and the empty-state row -- the concrete regression this closes: swapping two `<th>` labels without touching `SessionRow` (round-2 addition).
  [`main.test.ts:56`](../../../../src/dashboard/main.test.ts#L56)

- Runs the real `Bun.build` call and serves its output -- closes the gap where `bun test` never previously exercised the `build` script itself (round-2 addition).
  [`build.test.ts:25`](../../../../src/dashboard/build.test.ts#L25)

- Real `startServer` + real `connect()` round-trip against the actual `/event` route (round-1 addition, previously untested end-to-end).
  [`integration.test.ts:86`](../../../../src/dashboard/integration.test.ts#L86)
