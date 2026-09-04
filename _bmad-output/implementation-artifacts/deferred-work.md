- source_spec: `_bmad-output/specs/spec-opencode-session-viewer/stories/1-core-projector-session-cost-state.md`
  summary: Decide and document a stable sort order for `getViewModels()`'s returned array (e.g. by `lastActivity` or `status`) before it becomes the literal AD-7 SSE snapshot payload.
  evidence: Currently returns `Map` insertion order with no documented guarantee; review flagged this matters once story 3 (SSE) broadcasts this array to the dashboard, but no requirement in SPEC.md/ARCHITECTURE-SPINE.md constrains it today.
