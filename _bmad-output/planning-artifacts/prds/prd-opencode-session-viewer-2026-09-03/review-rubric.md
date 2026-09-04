# PRD Quality Review — opencode-session-viewer

## Overall verdict

This PRD is unusually disciplined: the Vision is specific and non-swappable, every FR carries testable consequences, scope is honestly bounded with explicit Non-Goals and a well-populated Assumptions Index, and the single highest-risk unknown (FR-1's triggering event) is flagged twice — once as a `[NOTE FOR PM]`, once as Open Question 1 — rather than smoothed over. The risk that remains is downstream mechanics, not substance: one broken cross-reference, a couple of untested display fields in FR-2, and light structural inconsistency across the Feature subsections. None of it threatens the PRD's core usefulness, but a build agent following this document verbatim would stumble on the §5/§9 cross-reference and might not know how to verify "message count" / "last-activity time" render correctly.

## Decision-readiness — strong

Decisions are stated as decisions, not buried as considerations: "v1 is scoped to one project's Server instance (per user decision" (§5), "That narrowness is what makes it fast to build, easy to trust, and safe to publish" (§1) names the trade-off given up (fleet-manager ambitions) for what was chosen (narrow scope). `[NOTE FOR PM]` callouts land at real tensions, not safe checkpoints — §4.1's note on the auto-launch trigger being "the single highest-risk assumption in this PRD," and §8's note to "revisit before ever defaulting bind address to non-localhost" — both are genuine build-blocking or security-relevant tensions, not decorative flags. Open Questions (§11) are genuinely open: OQ1 names a current assumption but explicitly asks for verification, OQ4 and OQ5 have no answer baked in at all.

### Findings
*(none — dimension is strong, no findings needed)*

## Substance over theater — strong

No persona theater: a single UJ (Alex, §2.3) with a named protagonist who drives every Feature's "Realizes UJ-1" tag — not decorative. No NFR theater: §7's budgets are concrete numbers (2s first paint, 1s propagation, ~10-15 sessions) each explicitly marked `[ASSUMPTION]` rather than asserted as fact — this is the opposite of "system must be scalable" boilerplate. No Vision theater: §1's vision names the specific opencode behavior (cheap session-forking in the TUI) that creates the problem, not a generic "empower users" statement. SM-3 (GitHub stars/downloads) risks reading as a vanity metric, but it's explicitly labeled secondary and paired with a counter-metric (SM-C1) that guards against chasing it at the cost of scope discipline — that's the rubric's ask, not theater.

### Findings
*(none — dimension is strong, no findings needed)*

## Strategic coherence — strong

The thesis is explicit: "visibility doesn't scale with that parallelism" (§1), and every Feature traces back to it — Auto-Launch removes the need to remember to check, Live Session List answers "what's still working," Cost Tracking answers "what's it costing." Success Metrics validate the thesis rather than measuring raw activity: SM-1/SM-2 test the performance budgets the Vision depends on (low-overhead, real-time), and SM-C1 explicitly guards against scope creep chasing SM-3's adoption proxy. MVP scope kind is a coherent "problem-solving" shape — deferred items (§6.2) are all things that would dilute the narrow status+cost thesis (transcript drill-down, per-model breakdowns, cross-project aggregation).

### Findings
*(none — dimension is strong, no findings needed)*

## Done-ness clarity — adequate

Every FR has testable consequences with concrete verbs and thresholds — no "handles X gracefully" or "user-friendly" language left unqualified. Where "gracefully" does appear (§7 Reliability), it's immediately cashed out into a concrete definition ("logged, non-fatal to opencode itself"). This is the PRD's strongest dimension mechanically, with one real gap:

### Findings
- **medium** FR-2 doesn't test two of its four displayed fields (§4.2, FR-2) — The FR-2 description promises each session row shows "title, Session Status, message count, and last-activity time," but the three listed Consequences only test session appearance, status updates, and initial list population — none verify that message count or last-activity time render or update correctly. *Fix:* add a consequence like "message count and last-activity time update in place as `message.updated` events arrive, without a page reload."

## Scope honesty — strong

§5 Non-Goals does real work (six explicit exclusions, each with a reason, not a bare list). `[NON-GOAL]`-style reasoning appears throughout §6.2 with justification for each deferral (e.g., "nice-to-have signals identified during discovery but not required to satisfy the core JTBD"). Seven `[ASSUMPTION: …]` tags are all indexed in §12 (see Mechanical notes for the one partial exception). De-scoping is proposed honestly — §6.2's "deferred indefinitely per explicit user scoping decision, revisit only if strong demand emerges" reads as a real decision, not a silent omission. Open-items density (5 Open Questions + 8 inline assumptions + 3 `[NOTE FOR PM]`) is on the high side for a document meant to feed "downstream architecture and build work" (§0), but the concentration is honest rather than diffuse — most of the risk sits on one Feature (FR-1's trigger event), and the PRD names that concentration explicitly rather than spreading vague hedges across every section.

### Findings
*(none — dimension is strong; density is a downstream-sequencing consideration, not a scope-honesty flaw)*

## Downstream usability — adequate

Glossary (§3) is present and terms are used consistently in capitalized form (Session, Project, Server, Cost, Dashboard, Event, Plugin) across Features and NFRs. FR/UJ/SM IDs are contiguous and unique. UJ-1 has a named protagonist (Alex) carrying context inline — no floating UJs. One cross-reference is broken:

### Findings
- **medium** Broken cross-reference to §9 (§5 Non-Goals, line "v1 is scoped to one project's Server instance (per user decision; see §9)") — §9 is "Developer Product Details" (public surface, API contract, versioning, runtime target) and contains no discussion of the cross-project scoping decision the reader is sent there to find. *Fix:* point to §2.2 (Non-Users) where the shared/remote-dashboard exclusion is actually discussed, or drop the cross-reference.
- **low** Inconsistent Feature subsection structure (§4) — FR-1, FR-2/FR-4, and FR-5 each carry "Out of Scope" and/or "Feature-specific NFRs" subsections; FR-3 has only "Consequences." Not wrong, but a downstream reader scanning for a uniform Feature template will hit an unexplained gap. *Fix:* either add an explicit "Out of Scope: none" line to FR-3 or note in §0 that these subsections are optional per-Feature.

## Shape fit — strong

This is a single-operator developer tool that is also published for other users to install (§9's explicit framing: "per user's explicit 'others will use this' scoping decision"). The PRD threads that correctly — one UJ with a named protagonist (not over-formalized with multiple personas for what is functionally one JTBD), plus a lightweight capability-spec section (§9 Developer Product Details: public surface, API contract, versioning) that a pure single-operator internal tool wouldn't need but a publishable plugin does. No UJ density inflation, no missing UJs for a product where UX (a live dashboard) is genuinely load-bearing.

### Findings
*(none — dimension is strong, no findings needed)*

## Mechanical notes

- **Assumptions Index roundtrip — mostly clean, one gap.** All 7 `[ASSUMPTION: …]` inline tags with distinct content are indexed in §12. One partial exception: §7's "Live update propagation... under `[ASSUMPTION: 1 second]`" restates the same 1-second figure already indexed under §4.2 (FR-2), but as a separate inline occurrence it isn't separately indexed. Low impact since the underlying assumption is the same value, but a downstream reader auditing §12 against inline tags by section will find §7 under-indexed relative to what's actually in §7.
- **Glossary shorthand drift (low).** Several FR consequences shorten the glossary term "Session Status" to bare "Status" (e.g. §4.2 FR-2: "A Session's Status updates in place"). Consistent enough to follow, but strict grep-based downstream extraction (rubric's concern) would miss these on a "Session Status" search.
- **ID continuity — clean.** FR-1 through FR-5 contiguous and mapped 1:1 to Feature subsections (4.1→FR-1, 4.2→FR-2/FR-3, 4.3→FR-4, 4.4→FR-5). SM-1/2/3 plus counter-metric SM-C1 — no gaps. UJ-1 is the only UJ, appropriately.
- **Required sections — complete** for a chain-top, publish-intended developer-tool PRD: Vision, Target User, Glossary, Features/FRs, Non-Goals, MVP Scope, Cross-Cutting NFRs, Constraints, Developer Product Details, Success Metrics, Open Questions, Assumptions Index are all present.
</content>
