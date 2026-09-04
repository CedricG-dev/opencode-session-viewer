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
