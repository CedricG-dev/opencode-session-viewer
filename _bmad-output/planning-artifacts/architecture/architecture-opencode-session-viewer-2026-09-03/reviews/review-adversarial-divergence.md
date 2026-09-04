# Adversarial Divergence Review — ARCHITECTURE-SPINE.md

**Reviewer stance:** independent adversary. For each AD/convention I tried to construct two builders who each obey the letter of every rule yet ship incompatible units (clashing wire shapes, two owners of one entity, conflicting mutation/merge semantics).

**Spine reviewed:** `architecture-opencode-session-viewer-2026-09-03/ARCHITECTURE-SPINE.md` (140 lines, 6 ADs)

## Verdict

**Not yet closable as-is.** AD-1 and AD-4 are tight and hard to break. But four dimensions this altitude should own are left silent or self-contradictory, and each admits at least two letter-compliant, mutually incompatible implementations: (1) SSE framing on first connect and delta semantics, (2) aggregate-cost ownership, (3) the `errorMessage`/`tokens` field set, and (4) reconnect/disconnect ownership. These are exactly the "clashing shared-data shape" and "conflicting state-mutation path" failures the spine's own AD-2/AD-3 claim to prevent — the claim doesn't fully hold.

---

## Findings

### F1 — CRITICAL: No mandate that a new/reconnecting SSE client receives an initial full snapshot
AD-6's Rule only says broadcasts are identical to every *currently-connected* client; nothing says what a client gets *at the moment it connects*. Two letter-compliant builders of `server/sse.ts`:
- **Builder A** pushes the current `state-store` snapshot to a client immediately on connection (so FR-2 "list all sessions" works on page load).
- **Builder B** only forwards future `Hooks.event`-triggered broadcasts (never per-client special-cases anything, which reads as the more literal compliance with AD-6's "no per-client filtering/logic" prohibition).

Both satisfy AD-6 to the letter. B's dashboard is blank until the next opencode event fires (could be minutes on an idle session) — a silent, high-impact behavioral fork with no AD or convention to arbitrate it. This is precisely the "initial-snapshot on first SSE connect" dimension this altitude should own.

### F2 — CRITICAL: "Delta" wire semantics undefined — full-object replace vs partial-diff merge
Consistency Conventions: "SSE envelope: one JSON-encoded view-model array (full snapshot) or per-session delta per `data:` line — exact framing owned by `server/sse.ts`". "Delta" is never defined as full-object-per-changed-session vs a partial diff of only changed fields. Two builders:
- **`server/sse.ts` builder** sends only the fields that changed (bandwidth-minded reading of "delta") — e.g. `{ id, cost }` on a cost-only update.
- **`dashboard/store.ts` builder** treats every delta message as a full `ViewModel` and does `sessionsMap.set(id, msg)` (replace, not merge).

Result: fields absent from a partial delta (title, status, etc.) get wiped from client state. Nothing in AD-2/AD-3 specifies whether the client merges or replaces, nor whether `sse.ts` is required to always emit the full per-session object. This is a direct "conflicting state-mutation path" the lens is built to catch.

### F3 — CRITICAL: FR-4 aggregate cost has no defined owner or wire path
AD-2's Rule text is scoped to "session, cost, and status *state*" and forbids other modules from computing "derived **session** state." AD-3's canonical field list is explicitly *per-session* (no aggregate field). Yet FR-4 requires an aggregate total, and the Structural Seed even names a `components/` entry for it ("aggregate total"). Two builders, each textually defensible:
- **Dashboard builder**: sums the per-session `cost.dollars` values already received over SSE to render the aggregate client-side. This never touches raw opencode objects (AD-3's actual prohibition) and isn't "session state" (AD-2's actual noun) — so it reads as compliant.
- **Core/server builder**: reads AD-2's *Prevents* clause ("duplicated computation between backend and frontend") as barring any client-side arithmetic on cost, computes the aggregate in `core/view-model.ts`, and needs a wire shape to carry it — but AD-3 defines no aggregate field or secondary event type, so this builder invents one (e.g. a distinct `event: aggregate` SSE line) unilaterally.

These two builds are structurally incompatible: A's dashboard never expects an aggregate payload; B's server sends one the letter of AD-3 doesn't describe, and B's dashboard expects it. The spine's own "Prevents" intent (no duplicated computation) and its own Rule text (scoped to "session state") point in different directions here — a genuine loophole, not a missing edge case.

### F4 — HIGH: `errorMessage` referenced but not in the canonical wire-model field list
Consistency Conventions (Data & formats row): "`status`... never `\"error\"` — errors are `errorFlag`/`errorMessage`, per PRD glossary" — implying two fields. But AD-3's Rule gives the *exact* wire model as `{ id, title, status, tokens, cost, messageCount, lastActivity, errorFlag }` — no `errorMessage`. A `server/sse.ts` builder following AD-3's Rule literally (it explicitly says "never a raw... object", implying the field list is exhaustive) omits `errorMessage` entirely. A `dashboard/components` builder following the Convention text and PRD glossary builds an error-detail UI expecting `errorMessage` on the wire. Neither builder violated their respective source text; the two sources disagree with each other. Two owners of one concept ("what the user sees when a session errors"), no single field list is authoritative.

### F5 — MEDIUM/HIGH: Top-level `tokens` field collides in name with `cost.tokens`
AD-3's field list includes a top-level `tokens` field. The Convention's Data & formats row separately defines `cost = { tokens: number, dollars: number }` — so `cost.tokens` also exists. Nothing states the relationship between the two (same value duplicated for convenience? total context tokens vs billed tokens? cumulative vs per-turn?). Two `core/view-model.ts` builders can each populate top-level `tokens` with a different, defensible semantic (mirror of `cost.tokens`, vs a distinct raw-message-token count) — both produce a wire object with the *same field names and types*, so nothing breaks at the type level, but the two builds disagree on displayed values with no way to detect it via typechecking or the spine text. Silent semantic drift, not structural — hence not Critical, but real.

### F6 — HIGH: Reconnect/disconnect detection and backoff strategy is entirely unowned
The Structural Seed names a `disconnected indicator` component, proving the capability is in scope, but no AD or convention says: which module owns detecting "disconnected" (native `EventSource.onerror`/`readyState` in `dashboard/store.ts`? a component-level check?); what threshold distinguishes a transient reconnect blip from a real "disconnected" state; or whether the browser's native `EventSource` retry cadence is accepted as-is or whether the backend should send heartbeats so the client can positively confirm liveness (vs. absence of events during an idle session, which looks identical to a dead connection over a naive SSE contract). Two builders can each wire the indicator to a different signal (raw `onerror` firing vs. a debounced/heartbeat-based liveness check), producing different flicker/false-positive behavior with neither violating any Rule — because no Rule exists here. This is exactly the "reconnect backoff ownership" dimension called out as a canonical example for this lens.

### F7 — MEDIUM: Runtime error handling beyond HTTP bind failures is unspecified
Consistency Conventions cover HTTP *server bind* failures only ("caught, logged via `client.app.log()`, never throw out of the plugin factory"). Nothing governs: an SSE write failing because a client disconnected mid-broadcast; `core/state-store.ts` receiving a malformed/unexpected `Hooks.event` payload; or an exception during view-model derivation. One builder of `server/sse.ts` could let a single dead-socket write exception crash the whole broadcast loop (killing updates for every other connected client — directly undermining AD-6's "broadcasts identically to every client" guarantee at runtime even though the code satisfies AD-6 as written); another wraps every per-client write in try/catch and prunes dead sockets. Both are letter-compliant; only one is actually correct given AD-6's intent.

### F8 — LOW/MEDIUM: "reconnect" in AD-2 is ambiguous
AD-2: state-store "is rebuilt from `client.session.list()` (+ message data) at startup/reconnect." It's unclear whether "reconnect" means the plugin process re-establishing its hook/event relationship with opencode, or a browser SSE client reconnecting (which per AD-4 `core/` cannot even know about, since core has no outgoing dependency on `server/` — though `server/` calling *into* core is fine). If a builder reads it as "SSE client reconnect triggers a full core rebuild," every browser tab reconnect (including the native `EventSource` auto-retry covered in F6) would trigger a `client.session.list()` re-fetch storm — a real perf/behavior fork current text doesn't rule out.

### F9 — MEDIUM: Stack vs Structural Seed self-contradiction — `htm` dependency vs `.tsx` entry file
Stack table lists `htm` 3.1.1 as a dependency (tagged-template, no-JSX rendering style — normally chosen specifically to avoid needing a JSX transform). Structural Seed names the dashboard entry `main.tsx` (a JSX file). With `Bun.build` already providing native JSX transform for free, there's no stated reason to also carry `htm`, and no AD says which syntax `dashboard/components/*` are actually written in. Two builders of `dashboard/` can each pick a different rendering syntax for every component — not an AD violation (no AD governs this), but a spine-level self-contradiction between two of its own sections that will fork the codebase's component style on day one.

### F10 — LOW: No SSE route path / static-asset route convention
`server/http.ts` (static asset serving) and `server/sse.ts` (SSE endpoint) are separate files with no stated route naming (e.g. `/events` vs `/sse`, and whether it could collide with static asset paths). Low risk since both files are plausibly built by the same person per the "plugin.ts wires everything" framing, but still an unstated cross-file contract.

### F11 — LOW: Session-removal/lifecycle-end handling unspecified
No AD/convention states whether `core/state-store.ts` ever removes a session from its `Map` (e.g., on session delete) or whether entries live for the process lifetime. Low incompatibility risk (AD-2 keeps this single-owned regardless), but it's a silent completeness gap worth a line in Deferred or the Rule if intentional.

### F12 — LOW: AD-5 config handoff shape from `plugin.ts` to `server/http.ts` unspecified
AD-5 fixes *where* config is read (plugin.ts, from `options`) but not the shape/interface used to pass `port`/`hostname`/`autoLaunch` down into `server/http.ts` (individual args vs. a config object vs. also threading through `core/`, which shouldn't need it per AD-4). Low risk since `plugin.ts` is explicitly the sole wiring point and is unlikely to be split across builders.

---

## Checklist Assessment

- **Does every AD's Rule prevent its stated divergence?** AD-1 and AD-4: yes, cleanly. AD-5: yes for its narrow claim. AD-6: prevents per-client filtering/auth as claimed, but is silent on the adjacent "new connection state" question (F1) that naturally belongs to it. AD-2: prevents *per-session* duplicated computation, but its Rule's noun scope ("session state") doesn't reach the aggregate case its own Prevents-clause intent ("duplicated computation") seems to want covered (F3). AD-3: prevents raw-object leakage as claimed, but its field list is contradicted by the Conventions text (F4) and doesn't resolve framing/merge semantics (F1, F2).
- **Does Deferred leave a real gap?** No — everything explicitly deferred (persistence, non-localhost auth, per-model cost breakdowns, manual re-open, test framework, epic breakdown) is legitimately out of MVP scope and low-risk to punt. The gaps found above (F1–F9) are all in-scope-for-MVP concerns that Deferred does *not* mention, meaning they weren't deliberately deferred — they were just missed.
- **Is any whole dimension left completely silent that this altitude should own?** Yes, three: (1) initial-snapshot/delta wire framing on first SSE connect (F1, F2), (2) reconnect/disconnect ownership and backoff (F6), (3) runtime error handling beyond HTTP bind (F7). A fourth, aggregate-cost ownership (F3), is silent despite being directly required by an in-scope FR (FR-4).

## Recommended next AD/convention edits (not authored here, scope of this review is diagnostic)
- Extend AD-6 (or add AD-7) to state initial-connection behavior: every new SSE connection receives the current full snapshot first, then deltas.
- Define "delta" precisely in the Conventions row: full per-session object replace, never a partial diff — and state that `dashboard/store.ts` always replaces (never merges) on receipt.
- Resolve FR-4 aggregate cost ownership explicitly: computed in `core/view-model.ts` and broadcast, or client-summed from per-session costs — pick one and update AD-2/AD-3's scope language to match.
- Reconcile AD-3's field list with the Conventions text: either add `errorMessage` to the canonical list or strike it from the Conventions row.
- Clarify the relationship between top-level `tokens` and `cost.tokens` (duplicate value vs distinct semantic) or drop one.
- Add an explicit reconnect/disconnect ownership convention (module, signal, and whether heartbeats are needed).
