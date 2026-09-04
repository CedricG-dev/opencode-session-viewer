---
id: SPEC-opencode-session-viewer
companions:
  - ../../planning-artifacts/prds/prd-opencode-session-viewer-2026-09-03/prd.md
  - ../../planning-artifacts/architecture/architecture-opencode-session-viewer-2026-09-03/ARCHITECTURE-SPINE.md
sources: []
---

> **Canonical contract.** This SPEC and the files in `companions:` are the complete, preservation-validated contract for what to build, test, and validate. Source documents listed in frontmatter are for traceability — consult them only if you need narrative rationale or prose color this contract intentionally omits.

# opencode-session-viewer

## Why

opencode users increasingly run multiple sessions in parallel within one project, but visibility doesn't scale with that parallelism — checking a background session means switching to it, and there is no single place to see which sessions are still working, which finished, which errored, or how much each is costing, in real time. This is a vision to realize (a narrow, trustworthy, local dashboard) for opencode's existing users, published as an installable plugin so others can adopt it too — not just a personal tool.

## Capabilities

- **CAP-1**
  - **intent:** The Plugin opens the Dashboard in the user's browser automatically when opencode starts, with no manual command.
  - **success:** Starting opencode with the Plugin installed opens a browser tab to the Dashboard without user action. If the Plugin's local web server fails to start, opencode's own startup is not blocked, and a clear error is logged.

- **CAP-2**
  - **intent:** The Dashboard lists every Session created during the current opencode run in the current Project, each showing title, Session Status, message count, and last-activity time.
  - **success:** A newly created Session appears in the list without a page reload. Status, message count, and last-activity update in place as Events arrive, and a `session.error` Event shows a visible error indicator on that Session's row. Sessions from prior opencode invocations or other projects/instances never appear.

- **CAP-3**
  - **intent:** The Dashboard stays current by subscribing to opencode's Event stream and updating in place, instead of polling on an interval.
  - **success:** No Session data changes visibly without a corresponding Event having fired. If the Event stream connection drops, the Dashboard shows a visible "disconnected" indicator and attempts to reconnect rather than silently showing stale data.

- **CAP-4**
  - **intent:** The Dashboard shows each Session's token usage and dollar Cost, plus a running total across all listed Sessions, exactly as opencode itself computes them.
  - **success:** Cost figures shown always match opencode's own reported Message/Session data — the Plugin performs no independent pricing calculation. The aggregate total updates live as any Session's Cost changes.

- **CAP-5**
  - **intent:** Users can configure the Dashboard's local port, bind address, and whether Auto-Launch (CAP-1) is enabled, via `opencode.json`.
  - **success:** Default bind address is `127.0.0.1`. Setting `autoLaunch: false` suppresses CAP-1 without breaking any other capability. An invalid or already-in-use configured port fails gracefully — opencode startup is not blocked.

## Constraints

- Session content and Cost data never leave the local machine — no telemetry, no analytics, no external calls beyond what opencode itself already makes to model providers.
- Dashboard binds to `127.0.0.1` by default; exposing it on other network interfaces requires an explicit, documented opt-in — Session content can include sensitive project code.
- Session-derived content (titles, any message text ever surfaced) is untrusted for rendering purposes — no unescaped HTML injection from Session data into the Dashboard.
- No authentication is planned for MVP given the localhost-only default; this becomes load-bearing before bind address is ever defaulted to non-localhost.
- Cost figures must never be computed independently of opencode's own reporting — protects against pricing drift when providers change rates.
- Scope is one project's single opencode server instance, current run only — no cross-project or cross-instance aggregation, and no historical session store from prior invocations.

## Non-goals

- Not a replacement for opencode's TUI/Web UI conversation view — no full message/transcript viewing.
- Not a cross-project or cross-machine fleet manager.
- Not a billing/invoicing/export tool — no historical reports, no CSV/PDF export, no accounting integration.
- Not a remote/shared/multi-user dashboard — no authentication, no accounts.
- Not a general project-management or task-tracking tool — any task display mirrors opencode's own Session state, never adds new task types.
- Does not recompute, cache independently, or override opencode's cost/pricing data.
- No telemetry or analytics collection, in any version.
- No manual re-open path for the Dashboard after the browser tab is closed — not a permanent exclusion, confirmed deferred as a possible fast-follow.

## Success signal

A developer running several opencode sessions in parallel can glance at one already-open browser tab and see every current-run Session's live status and cost, updated purely by opencode's own Event stream with no manual refresh — first paint under ~2s, live-update propagation under ~1s — without switching to the TUI, polling, or measurably slowing opencode's own startup.

## Assumptions

- Latency/scale budgets carried from the PRD's own `[ASSUMPTION]` tags, not independently benchmarked: auto-launch under ~3s, Dashboard first paint under ~2s, live-update propagation under ~1s, scalability target ~10-15 concurrent Sessions, Plugin startup overhead sub-second.
- opencode's built-in Cost computation is treated as authoritative as-is; no reconciliation investigation against provider-side rounding or cached-token discounts is planned.
</content>
