- source_spec: `_bmad-output/specs/spec-opencode-session-viewer/stories/1-core-projector-session-cost-state.md`
  summary: Decide and document a stable sort order for `getViewModels()`'s returned array (e.g. by `lastActivity` or `status`) before it becomes the literal AD-7 SSE snapshot payload.
  evidence: Currently returns `Map` insertion order with no documented guarantee; review flagged this matters once story 3 (SSE) broadcasts this array to the dashboard, but no requirement in SPEC.md/ARCHITECTURE-SPINE.md constrains it today.

- source_spec: `_bmad-output/specs/spec-opencode-session-viewer/stories/2-local-server-and-auto-launch.md`
  summary: `package.json` has no `main`/`module`/export field pointing at `src/plugin.ts` — nothing yet wires this file up as the actual entry point opencode's plugin loader would resolve.
  evidence: Pre-existing since story 1's scaffolding; no story has explicitly owned packaging/entry-point wiring yet. Needs resolving before the plugin can actually be installed and loaded by a real opencode instance.

- source_spec: `_bmad-output/specs/spec-opencode-session-viewer/stories/2-local-server-and-auto-launch.md`
  summary: `resolveOpenCommand`'s win32 branch (`["cmd", "/c", "start", "", url]`) does not quote/escape its `url` argument.
  evidence: Harmless today since the URL is always derived from a real `Bun.serve` server's own `.url` (never attacker- or user-controlled). Becomes worth a second look once Story 5 (Configuration) makes `hostname`/`port` configurable via `opencode.json`, even though that's still trusted local config, not attacker input.

- source_spec: `_bmad-output/specs/spec-opencode-session-viewer/stories/3-sse-live-transport.md`
  summary: `core/state-store.ts` never handles `session.deleted`/`message.removed` events — sessions and their message maps are never evicted, so memory grows unbounded over a long-running opencode process.
  evidence: The handler set was fixed at story 1, before any live event wiring existed, so this predates story 3. It only becomes consequential now that story 3 wires `Hooks.event` to actually deliver live events into `core/state-store.ts` for the process's full lifetime. Flagged by story 3's Edge Case Hunter review round.

- source_spec: `_bmad-output/specs/spec-opencode-session-viewer/stories/4-dashboard-frontend.md`
  summary: Dashboard has no accessibility affordances (`DisconnectedIndicator` lacks an ARIA live region) and no mobile viewport meta tag.
  evidence: Neither SPEC.md nor the PRD states an accessibility or mobile-support requirement, so out of this story's scope, but flagged by Blind Hunter as a real gap for a browser-based dashboard.

- source_spec: `_bmad-output/specs/spec-opencode-session-viewer/stories/4-dashboard-frontend.md`
  summary: `bun run build`'s output is unminified.
  evidence: Fine at the current ~34KB bundle size; worth revisiting only if the dashboard's bundle or the number of returning users grows enough for load time to matter (SPEC.md's ~2s first-paint budget is not yet at risk). Note `Bun.build` already content-hashes output filenames, so cache-busting is not a gap here.

- source_spec: `_bmad-output/specs/spec-opencode-session-viewer/stories/4-dashboard-frontend.md`
  summary: `lastActivity` renders as a raw ISO-8601 string with no human-relative/localized formatting.
  evidence: Unambiguous and precise as-is; no PRD/SPEC requirement mandates a specific format. Flagged by Blind Hunter as a UX polish item, not a correctness gap.

- source_spec: `_bmad-output/specs/spec-opencode-session-viewer/stories/4-dashboard-frontend.md`
  summary: `dashboard/store.ts`'s `applyPayload` trusts the SSE payload's shape (a well-formed `ViewModel`/`ViewModel[]`) without validating field types (e.g. non-numeric `cost`, missing `id` on a delta).
  evidence: Currently safe — `server/sse.ts` broadcasts only what `core/view-model.ts`'s typed `deriveViewModel` produces, the sole writer of this wire contract (AD-3). Would need hardening only if that single-writer trust boundary ever changes (e.g. a second server implementation).

- source_spec: `_bmad-output/specs/spec-opencode-session-viewer/stories/4-dashboard-frontend.md`
  summary: The dashboard ships with zero CSS/visual styling -- e.g. no visual distinction for `errorFlag` rows or `busy`/`retry`/`idle` status, beyond the plain text already shown.
  evidence: No PRD or architecture requirement mandates a specific visual design for MVP. This was an oversight not logged during the story's own review rounds rather than a deliberately documented exclusion -- logging it now for future follow-up.
