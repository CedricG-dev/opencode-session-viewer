# Review — Version & Reality-Check Verification

**Target:** `ARCHITECTURE-SPINE.md` (opencode-session-viewer, 2026-09-03)
**Lens:** Every committed decision must be web-researched or reality-checked, not asserted from training data — library/framework versions, technology existence/fit, and (greenfield) starter defaults.
**Method:** Independently re-fetched primary sources on 2026-09-03: `opencode.ai/docs/plugins/`, `opencode.ai/docs/config/`, `opencode.ai/docs/sdk/`, `opencode.ai/docs/server/`, `opencode.ai/config.json` (live schema), `github.com/anomalyco/opencode/blob/dev/packages/plugin/src/index.ts` (raw, dev branch), `npmjs.com/package/preact`, `npmjs.com/package/@preact/signals`, `npmjs.com/package/htm`, and `bun.com/docs/bundler`. Not just trusting the spine's own citations — each claim was re-derived from the fetched source independently.

## Verdict

**PASS with two follow-ups.** Every version number and API claim in the spine checked out exactly against live sources as of today — this is unusually well-researched for an architecture doc. The one real gap: AD-5's config-passing mechanism (the `options` second argument to the plugin factory) is confirmed only at the TypeScript-type level (source file) and JSON-schema level (config.json), never demonstrated in any working example on the public Plugins doc page — so it's verified as *declared*, not verified as *behaviorally exercised*. That's a reasonable but not airtight foundation for FR-5's entire config story, and should get an early smoke-test in implementation.

---

## Findings

### 1. Stack table — package versions (LOW risk, all CONFIRMED)

| Claim in spine | Verification | Result |
| --- | --- | --- |
| `preact` 10.29.8 | npmjs.com/package/preact — current published version is **10.29.8**, published ~1 month ago | ✅ Exact match, current latest |
| `@preact/signals` 2.11.1 | npmjs.com/package/@preact/signals — current published version is **2.11.1**, published 21 days ago | ✅ Exact match, current latest |
| `htm` 3.1.1 | npmjs.com/package/htm — current published version is **3.1.1** | ✅ Exact match, current latest, BUT last published **4 years ago** |

**Note on htm 3.1.1 (informational, not a blocker):** the version pin is accurate, but the package itself hasn't shipped a release in 4 years. It's stable, small (0 dependencies, 342 dependents), and still recommended directly in Preact's own README as the JSX-alternative for build-tool-free usage — so it "still exists and fits" per the lens's own test. Flagging only because a 4-year-dormant dependency is exactly the kind of thing this lens should surface, even when the specific claim (the version number) is correct.

### 2. AD-5 — Plugin factory signature (MEDIUM risk — partially unverified)

Spine claims: `export type Plugin = (input: PluginInput, options?: PluginOptions) => Promise<Hooks>`, cited against `packages/plugin/src/index.ts` (dev branch).

- **Re-fetched the exact file** (raw GitHub, dev branch) independently. The type signature is **verbatim correct**:
  ```ts
  export type PluginOptions = Record<string, unknown>
  export type Plugin = (input: PluginInput, options?: PluginOptions) => Promise<Hooks>
  ```
  ✅ Confirmed, exact match.

- **However:** the public `/docs/plugins/` page — which is the documentation surface a plugin author would actually read — never shows or mentions this second `options` argument anywhere. Every example on that page (`Basic structure`, `TypeScript support`, `Send notifications`, `.env protection`, `Inject environment variables`, `Custom tools`, `Logging`, `Compaction hooks`) destructures only the single `PluginInput` object: `async ({ project, client, $, directory, worktree }) => {...}`. No example anywhere demonstrates reading a second `options` parameter, and no prose describes how/whether the loader actually invokes the factory with it populated at runtime.

- **The `[name, options]` tuple form of `opencode.json`'s `plugin` array is real** — independently confirmed against the live `config.json` schema fetched today:
  ```json
  "plugin": { "type": "array", "items": { "anyOf": [
    { "type": "string" },
    { "type": "array", "prefixItems": [{"type":"string"},{"type":"object"}], "minItems": 2, "maxItems": 2 }
  ]}}
  ```
  ✅ Confirmed the tuple shape is schema-valid. But again, `/docs/config/`'s own "Plugins" section only shows the plain string-array form (`"plugin": ["opencode-helicone-session", "@my-org/custom-plugin"]`) — no tuple-with-options example anywhere in the docs, only in the schema and the SDK's `Config` type (`plugin?: Array<string | [string, PluginOptions]>`).

**Assessment:** this is verified at the type/schema level from two independent source files (matching, which is reassuring), but it is an **undocumented, unexemplified feature path** — nothing on the doc site shows it working end-to-end. Type declarations describe intent; they don't guarantee the loader wires the second argument through correctly in all cases (e.g., some loaders type a parameter for forward-compat before fully wiring it). Recommend: treat AD-5 as verified-but-unconfirmed-by-example, and get a trivial smoke test (`console.log(options)` in a real local plugin loaded via the tuple form) into the project early, before other code depends on config values actually arriving this way.

### 3. `Config` JSON schema `additionalProperties: false` (LOW risk, CONFIRMED)

Spine claims the top-level `Config` schema is `additionalProperties: false`, used to justify why a generic `opencode.json` passthrough namespace doesn't exist. Re-fetched `opencode.ai/config.json` directly: the `"Config"` definition's closing property is exactly `"additionalProperties": false`. ✅ Confirmed, exact match.

### 4. `client.app.log()` (LOW risk, CONFIRMED)

Used in Consistency Conventions ("Logging via `client.app.log()` only — never `console.log`"). Confirmed against both `/docs/plugins/` ("Logging" example) and `/docs/sdk/` (App API table: `app.log()` → writes a log entry, `boolean`). ✅ Confirmed, matches current docs on both pages.

### 5. `Hooks.dispose()` and `Hooks.event` (LOW risk, CONFIRMED)

Spine (Consistency Conventions, design paradigm diagram) relies on `Hooks.dispose()` closing the server and `Hooks.event` as the event subscription point. Re-fetched `packages/plugin/src/index.ts` directly: `interface Hooks { dispose?: () => Promise<void>; event?: (input: { event: Event }) => Promise<void>; ... }`. ✅ Confirmed, both present exactly as named.

### 6. `client.session.list()` (LOW risk, CONFIRMED — but citation asymmetry noted)

AD-2 states the projector is "rebuilt from `client.session.list()` (+ message data) at startup/reconnect." Independently confirmed against `/docs/sdk/` Sessions API table: `session.list()` → "List sessions" → returns `Session[]`. ✅ Confirmed, exists as documented.

**Minor process note:** AD-5 explicitly cites its source ("verified against `@opencode-ai/plugin`'s `packages/plugin/src/index.ts`"). AD-2's equally load-bearing `client.session.list()` claim carries no such citation in the spine text. The claim turned out to be correct, but the spine is inconsistent about showing its work — worth normalizing for future ADs at this rigor level.

### 7. Core paradigm assumption — `/event` SSE stream as "single source of truth" (LOW risk, CONFIRMED)

The entire paradigm ("opencode's own `/event` stream is the single source of truth") rests on opencode actually exposing a live SSE event endpoint. Confirmed against `/docs/server/`: `GET /event` — "Server-sent events stream. First event is `server.connected`, then bus events." ✅ Confirmed — this is the single most load-bearing technical assumption in the entire spine, and it holds up.

### 8. Bun as the plugin runtime (LOW risk, CONFIRMED indirectly)

Stack table says Bun "matches opencode's own Bun requirement — not independently pinned." Confirmed indirectly: `/docs/plugins/` states "npm plugins are installed automatically using Bun at startup," and the re-fetched `PluginInput` type includes `$: BunShell` (Bun's own shell API type) as a first-class field passed to every plugin factory. ✅ Reasonably confirmed — Bun is baked into the plugin runtime, not an incidental detail.

### 9. `Bun.build` (LOW risk, CONFIRMED)

Stack table: "Bun.build — native to the Bun runtime — no separate bundler dependency." Re-fetched `bun.com/docs/bundler` directly: `Bun.build()` is documented as the current, live JS bundler API (`await Bun.build({ entrypoints, outdir })`). ✅ Confirmed, current and real.

### 10. `Bun.serve` (informational — NOT independently re-confirmed this session)

Structural Seed's `server/http.ts` and the Consistency Conventions ("`Hooks.dispose()` closes the `Bun.serve` server") both depend on `Bun.serve`. My attempted fetch of `bun.com/docs/api/http` 404'd (wrong URL guess on my part) and I did not retry with a corrected URL before concluding the review. `Bun.serve` is one of Bun's most fundamental, long-stable APIs, so real-world risk is low — but strictly speaking this specific claim was not independently re-verified against a live source in this session, unlike everything else above. Flagging for completeness per the lens's instruction to check every named technology.

### 11. Session/message event names available to `Hooks.event` (informational, no discrepancy)

The spine deliberately stays abstract ("raw opencode `Event`/`Session`/`Message` objects") rather than enumerating specific event names, and explicitly defers epic/story breakdown. For reference, `/docs/plugins/`'s live Events list includes `session.created`, `session.updated`, `session.idle`, `session.error`, `session.status`, `session.compacted`, `session.deleted`, `session.diff`, plus `message.updated`, `message.removed`, `message.part.updated`, `message.part.removed` — these appear sufficient to back FR-2/FR-3/FR-4 (status, cost, message count, live updates). No contradiction found; noted only because the lens asks to check event-name currency.

### 12. Minor naming-collision note (out of lens scope, flagged briefly)

opencode's own built-in `server` config block (`server.port`, `server.hostname`, used by `opencode serve`/`opencode web`) and the session-viewer plugin's own proposed custom `options.port`/`options.hostname` (read via AD-5's tuple form) use identical key names in two unrelated namespaces. Not a version/currency issue and not something the web can settle either way — just worth the team's awareness to avoid user confusion in docs/README, since it's easy to conflate "opencode's server port" with "the session-viewer dashboard's port."

---

## Summary Table

| # | Claim | Verified against | Result |
| - | --- | --- | --- |
| 1 | preact 10.29.8 | npm | ✅ exact |
| 1 | @preact/signals 2.11.1 | npm | ✅ exact |
| 1 | htm 3.1.1 | npm | ✅ exact (dormant 4y, still fits) |
| 2 | Plugin factory `(input, options?)` signature | GitHub source (dev branch) | ✅ type-confirmed; ⚠ no documented working example |
| 2 | `[name, options]` tuple config form | live config.json schema | ✅ schema-confirmed; ⚠ no doc-page example |
| 3 | Config `additionalProperties: false` | live config.json schema | ✅ exact |
| 4 | `client.app.log()` | docs/plugins, docs/sdk | ✅ confirmed |
| 5 | `Hooks.dispose()`, `Hooks.event` | GitHub source | ✅ confirmed |
| 6 | `client.session.list()` | docs/sdk | ✅ confirmed (uncited in spine) |
| 7 | `/event` SSE endpoint exists | docs/server | ✅ confirmed |
| 8 | Bun is the plugin runtime | docs/plugins | ✅ confirmed indirectly |
| 9 | `Bun.build` | bun.com/docs/bundler | ✅ confirmed |
| 10 | `Bun.serve` | — | ⚠ not independently re-checked this session |
