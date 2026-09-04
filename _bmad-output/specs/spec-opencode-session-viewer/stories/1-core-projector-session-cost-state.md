---
title: 'Core projector (session/cost state)'
type: 'feature'
created: '2026-09-04'
status: 'done'
review_loop_iteration: 0
baseline_commit: 'fdac9bd35c18d7bde0c4bb0e49a015d73c5a1e7b'
context:
  - '{project-root}/_bmad-output/specs/spec-opencode-session-viewer/SPEC.md'
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-opencode-session-viewer-2026-09-03/ARCHITECTURE-SPINE.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** No code exists yet. The plugin needs a backend "Projector" — an in-memory, per-session read model built exclusively from opencode's own `Hooks.event` stream — before any server/transport or UI work (CAP-2, CAP-4) can consume it.

**Approach:** Scaffold the package (`package.json`, `tsconfig.json`) and add `src/core/state-store.ts` (raw per-session state, mutated only by event handlers) plus `src/core/view-model.ts` (the `ViewModel` type and pure derivation from that raw state). No server, no UI, no network calls in this story.

## Boundaries & Constraints

**Always:** `core/` has zero outgoing imports from `server/` or `dashboard/` (AD-4). The store starts empty and is populated only by explicit event-handler calls, never seeded from a full session list (AD-2). `ViewModel.tokens`/`.cost` are sums of opencode's own reported per-assistant-message `tokens`/`cost` — never independently computed (SPEC constraint, AD-2). `status` is exactly `"idle" | "busy" | "retry"`, never `"error"` (architecture Consistency Conventions).

**Ask First:** none — resolved during planning (see Design Notes).

**Never:** No `Bun.serve`, HTTP, SSE, or dashboard code in this story. No use of `client.session.list()`/`session.messages()` (that backfill wiring belongs to `plugin.ts`, a later story).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| New session | `session.created` event, unknown `id` | Store gains an entry; `deriveViewModel` returns `status:"idle"`, `messageCount:0`, `tokens:0`, `cost:0` | N/A |
| Status change | `session.status` event, known `id` | Stored `status` updates; other fields unchanged | Unknown `id` → no-op |
| Assistant message updates twice (streaming) | `message.updated` fired twice for the same `messageID` with growing `cost`/`tokens` | Second derive reflects only the latest values for that `messageID` (no double-count) | N/A |
| Session error | `session.error` event with `sessionID` and an error union member | `errorFlag:true`, `errorMessage` set from the error's message | Missing `sessionID` → event ignored (no synthetic attribution) |
| Unknown session referenced | `message.updated`/`session.status`/`session.error` for an `id` never seen via `session.created`/`session.updated` | No-op — never fabricate a session entry | N/A |

</frozen-after-approval>

## Code Map

- `package.json` -- NEW: name, `"type": "module"`, deps `@opencode-ai/plugin@^1.18.0`, `@opencode-ai/sdk@^1.18.0`; devDeps `typescript@^5`, `@types/bun@^1.4.1`
- `tsconfig.json` -- NEW: `target/module: esnext`, `moduleResolution: bundler`, `strict: true`, `types: ["bun"]`
- `src/core/view-model.ts` -- NEW: `ViewModel` type + `SessionState` type + `deriveViewModel(state: SessionState): ViewModel`
- `src/core/state-store.ts` -- NEW: `Map<string, SessionState>` (module-private) + event-handler exports + `getViewModels()`/`getViewModel(id)`
- `src/core/state-store.test.ts` -- NEW: `bun:test` covering the I/O matrix rows above

## Tasks & Acceptance

**Execution:**
- [x] `package.json`, `tsconfig.json` -- create -- minimal Bun/TS scaffolding, no code yet exists in the repo
- [x] `src/core/view-model.ts` -- add `ViewModel`/`SessionState` types + `deriveViewModel` -- pure function, no state, per Design Notes derivation rules
- [x] `src/core/state-store.ts` -- add the private `Map` and handlers `handleSessionCreated`, `handleSessionUpdated`, `handleSessionStatus`, `handleSessionIdle`, `handleSessionError`, `handleMessageUpdated`, plus `getViewModels()`/`getViewModel(id)` -- the only way the map is ever mutated
- [x] `src/core/state-store.test.ts` -- unit-test each I/O matrix row -- guards the no-double-count and unknown-id-is-noop rules

**Acceptance Criteria:**
- Given a `session.created` event for a new id, when `getViewModel(id)` is called, then it returns a `ViewModel` with `status:"idle"`, `messageCount:0`, `tokens:0`, `cost:0`, and `errorFlag:false`.
- Given two `message.updated` events for the same assistant `messageID` with increasing `cost`, when derived, then the session's `cost` reflects only the latest value for that message, not the sum of both events.
- Given a `session.error` event carrying a `sessionID`, when derived, then `errorFlag` is `true` and `errorMessage` is a non-empty string.
- Given `src/core/` is statically imported, then it has no `import` from any `server/` or `dashboard/` path (AD-4, grep-checkable).

## Spec Change Log

- **Review round 1 (patch, no spec change):** Blind Hunter / Edge Case Hunter / Verification Gap review found: (1) `extractErrorMessage` returned an empty string instead of falling back to `error.name` when `data.message` was `""`, violating the non-empty-`errorMessage` AC; (2) `handleSessionUpdated`, `handleSessionIdle`, `handleSessionCreated`-idempotency, non-assistant-message exclusion, and the `extractErrorMessage` fallback branch had zero test coverage. Both fixed as patches (code + 9 new test cases); no `<frozen-after-approval>` or Code Map change needed — the code deviated from the spec's own stated behavior, not the spec from intent. Sort order of `getViewModels()` was flagged but deferred to story 3 (SSE) — see `implementation-artifacts/deferred-work.md`.

## Design Notes

- **Raw internal state** (`SessionState`, private to `core/`): `{ session: Session; messages: Map<string, Message>; status: "idle" | "busy" | "retry"; errorFlag: boolean; errorMessage?: string }`. `Session`/`Message`/`Event` types come from `@opencode-ai/sdk` (the concrete source of these types; `@opencode-ai/plugin`'s `Hooks.event` uses the same `Event` union without re-exporting the leaf types by name).
- **Aggregation avoids double-counting**: `message.updated` always carries the message's current cumulative `cost`/`tokens` (not a delta), so `state-store` upserts into `messages` by `id` and `view-model.ts` re-sums from that map on every derive — a later event for the same `messageID` naturally replaces, never adds to, the earlier value.
- **`tokens` sum** = `input + output + reasoning + cache.read + cache.write` across all `role:"assistant"` messages in the map. **`cost` sum** = `cost` across the same set. **`messageCount`** = `messages.size` (user + assistant, per PRD FR-2).
- **`lastActivity`** = `new Date(session.time.updated).toISOString()` — opencode's own session-level timestamp, already updated on new messages; avoids scanning the message map for the same answer.
- **Default `status`** on `session.created`/`session.updated` (when no prior state exists) is `"idle"` — conservative default until a `session.status`/`session.idle` event says otherwise; `session.updated` never resets `status` on an already-known session.
- **Error text**: `session.error`'s `properties.error` is a discriminated union; use `.data.message` when present (all variants except the bare `ProviderAuthError`/`ApiError` shape carry this — check per-variant), else fall back to the error's `name`.

## Verification

**Commands:**
- `bun test src/core/state-store.test.ts` -- expected: all cases pass
- `bunx tsc --noEmit` -- expected: no type errors

## Suggested Review Order

**Wire-model derivation**

- Entry point: the `ViewModel` shape this whole story exists to produce, and the AD-4 zero-outgoing-dependency boundary.
  [`view-model.ts:9`](../../../../src/core/view-model.ts#L9)

- Pure aggregation: re-sums from the messages map every call, so a later `message.updated` naturally replaces rather than accumulates.
  [`view-model.ts:37`](../../../../src/core/view-model.ts#L37)

**Event-driven state mutation**

- The module-private store — the only place `Hooks.event` data is allowed to land (AD-2).
  [`state-store.ts:13`](../../../../src/core/state-store.ts#L13)

- `session.updated`'s two branches: preserve-on-known vs. discovery-on-unknown — the trickiest handler in this story.
  [`state-store.ts:34`](../../../../src/core/state-store.ts#L34)

- Error-message extraction: falls back to `error.name` on both a missing and an empty-string `data.message` (review-round-1 fix).
  [`state-store.ts:18`](../../../../src/core/state-store.ts#L18)

- `session.error`'s missing-`sessionID` guard — never fabricates a session from an unattributed error.
  [`state-store.ts:62`](../../../../src/core/state-store.ts#L62)

**Tests and scaffolding**

- Full I/O-matrix coverage plus the review-round-1 additions (idempotency, non-assistant exclusion, fallback branches).
  [`state-store.test.ts:79`](../../../../src/core/state-store.test.ts#L79)

- First code in the repo: minimal Bun/TS scaffolding, no build/dev scripts yet (none needed until `server/`).
  [`package.json:1`](../../../../package.json#L1)
