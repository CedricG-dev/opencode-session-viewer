---
title: opencode-session-viewer
status: final
created: 2026-09-03
updated: 2026-09-03
---

# PRD: opencode-session-viewer
*Working title — confirm.*

## 0. Document Purpose

This PRD is written for the plugin's author (PM/dev in one) and for downstream architecture and build work. Vocabulary is Glossary-anchored (§3); Functional Requirements are grouped under Features (§4) and numbered globally (FR-1…). Inline `[ASSUMPTION: ...]` tags mark inferences made without explicit user confirmation; all are indexed in §12 for review. No prior product docs, briefs, or research exist for this project — this PRD is the first artifact.

## 1. Vision

opencode users increasingly run multiple sessions in parallel within a single project — one agent exploring a bug, another drafting a migration, a third grinding through a long refactor — because the TUI makes it cheap to spin up a new session rather than wait. But visibility doesn't scale with that parallelism: checking on a background session means switching to it, and there's no single place to see which sessions are still working, which finished, which errored, and — critically — how much each is costing, in real time.

**opencode-session-viewer** is an opencode plugin that solves this by launching a local browser dashboard the moment it's relevant, showing every session in the current project with live status and cost, updated automatically as opencode's own event stream fires — no manual refresh, no separate app to run, no leaving the terminal-first workflow opencode is built around.

It is scoped deliberately narrow: one project, one opencode instance, status and cost — not a rebuild of the TUI's conversation view, not a cross-project fleet manager, not a billing platform. That narrowness is what makes it fast to build, easy to trust, and safe to publish for other opencode users to install.

## 2. Target User

### 2.1 Jobs To Be Done

- **Functional:** See real-time Session Status (idle / busy / retry, plus errors) and cost (tokens + $) across every session in my current project, without tabbing through the TUI or querying the API by hand.
- **Emotional:** Confidence that no background session is silently stuck, erroring, or burning cost unnoticed.
- **Contextual:** Most valuable when running several sessions in parallel in one project — the exact pattern opencode's cheap session-forking encourages.

### 2.2 Non-Users (v1)

- Users who only ever run a single session at a time — low marginal value, TUI already shows what they need.
- Teams wanting a **shared/remote** dashboard across machines, collaborators, or projects — this is a single-user, single-project, local tool (see §5.1).
- Users who cannot or do not install local opencode plugins (for example, locked-down/managed environments).

### 2.3 Key User Journeys

- **UJ-1. Alex tracks parallel opencode sessions without losing focus.**
  - **Persona + context:** Alex runs opencode on a large project and kicks off three sessions in parallel — one exploring a bug, one drafting a migration, one running a long refactor — and wants to know which is still working, which finished, and what each is costing before checking in on any of them.
  - **Entry state:** opencode already running in the project; the plugin is installed and configured with default settings; the dashboard opened automatically in a browser tab when opencode started (FR-1).
  - **Path:** Alex starts a third session while two are already running. The dashboard tab, already open, updates live with no manual refresh: session 1 shows `idle` (finished), session 2 `busy`, session 3 `busy` — each with running token/$ cost, plus a total across all three.
  - **Climax:** Alex notices session 1 finished (cost: $0.42) without switching away from other work, and separately notices session 3's cost climbing faster than expected.
  - **Resolution:** Alex switches to session 1 in the TUI to review its output, and reconsiders session 3's scope having caught the cost trend early — a check they would otherwise have only made by interrupting their work to poll each session manually.
  - **Edge case:** If Alex closes the dashboard tab, it does not reopen on its own mid-run — see Open Question 1 on a manual re-open path.

## 3. Glossary

- **Session** — A single opencode conversation/task thread within a project, identified by a session ID, with a status and its own message history. A project can have many concurrent sessions.
- **Project** — The opencode-managed workspace (typically a git working directory) an opencode server instance is running against. This plugin scopes all data to one project's server instance (see FR-2 Out of Scope).
- **Server** — The `opencode serve` HTTP process that opencode's TUI/clients talk to; exposes the Session, Message, and Event APIs this plugin consumes.
- **Session Status** — The current state of a Session as reported by the Server: `idle`, `busy`, or `retry` (a transient provider-retry state carrying an attempt count and next-retry time). Confirmed against opencode's SDK types — there is no `error` status value; Session errors surface separately via the `session.error` Event, not as a Session Status.
- **Cost** — The token usage and corresponding dollar cost of a Session, as computed and reported by opencode itself (via Message data) — this plugin displays it; it does not compute or override it.
- **Dashboard** — The browser page this plugin serves, showing the live list of Sessions in the current Project with Session Status and Cost.
- **Event** — A Server-Sent Event on opencode's `/event` bus (for example, `session.created`, `session.updated`, `session.idle`, `session.status`, `message.updated`) that the plugin subscribes to in order to keep the Dashboard live without polling.
- **Plugin** — This product: an opencode plugin (loaded from `.opencode/plugins/` or via npm through `opencode.json`) that hooks Events and uses the opencode SDK `client` to serve the Dashboard.

## 4. Features

### 4.1 Auto-Launch

**Description:** The Plugin opens the Dashboard automatically on opencode startup — the user never runs a command to start it. Confirmed against opencode's plugin loader: a plugin's factory function runs exactly once, synchronously, when opencode loads the plugin at startup (in-process, same Bun runtime as the server itself). Auto-launch therefore does not need to wait for or gate on any bus event — the Plugin starts its own local server (for example, via `Bun.serve`) and opens the browser directly in the factory body. The `event` hook is reserved for live updates after launch (§4.2), not for startup detection. Realizes UJ-1 (entry state).

**Functional Requirements:**

#### FR-1: Auto-launch on plugin startup

The Plugin starts a local web server and opens the Dashboard in the user's default browser as part of its factory function running at opencode startup, without any manual command.

**Consequences (testable):**
- Starting opencode in a project with the Plugin installed results in a browser tab opening to the Dashboard within [ASSUMPTION: 3 seconds], with no user action required.
- If the Plugin's web server fails to start (for example, port already in use), opencode's own startup is not blocked or delayed, and a clear error is logged via `client.app.log()` (per opencode plugin logging convention).

**Out of Scope:**
- Reopening the Dashboard after the user manually closes the browser tab, without restarting opencode — see Open Question 1.

**Feature-specific NFRs:**
- Plugin initialization must add negligible (sub-second, [ASSUMPTION]) overhead to opencode's own startup time.

### 4.2 Live Session List

**Description:** The Dashboard's core view: every Session in the current Project, with its Status, live-updating as Events arrive on the `/event` stream — no manual refresh. Realizes UJ-1 (path, climax).

**Functional Requirements:**

#### FR-2: List all sessions in the current project

The Dashboard displays every Session for the current Project (sourced from the Server's session-list API), each row showing: title, Session Status (see Glossary — errors are a separate signal, not a status value), message count, and last-activity time.

**Consequences (testable):**
- A newly created Session appears in the Dashboard list without a page reload, within [ASSUMPTION: 1 second] of the `session.created` Event.
- A Session's Session Status updates in place (for example, `busy` → `idle`, or `busy` → `retry` with attempt/next-retry details) without a page reload, driven by `session.status` / `session.idle` / `session.updated` Events; a `session.error` Event surfaces a visible error indicator on that Session's row.
- Message count and last-activity time update in place as `message.updated` Events arrive, without a page reload.
- The list reflects Sessions created since this opencode process started — not the project's full historical session store from prior invocations (see decision below).

**Out of Scope:**
- Sessions from previous opencode invocations (project history) — scoped to the current run only, to keep the dashboard focused on active/current work per the core JTBD.
- Sessions belonging to other projects or other concurrent opencode instances on the machine (§5.1).
- Full message/transcript viewing (§5.1).

#### FR-3: Live updates via event stream

The Dashboard subscribes to the Server's Event stream and updates in place as relevant Events arrive, rather than polling on an interval.

**Consequences (testable):**
- With the Dashboard open and idle, no Session data changes visibly without a corresponding Event having fired.
- If the Event stream connection drops, the Dashboard detects it and attempts to reconnect, surfacing a visible "disconnected" indicator in the meantime rather than silently showing stale data.

**Out of Scope:** none beyond what FR-2 already excludes.

### 4.3 Cost Tracking

**Description:** For each Session, and as a running total, the Dashboard shows Cost (tokens and $) exactly as opencode itself computes it — the Plugin is a display layer, not a pricing engine. Realizes UJ-1 (climax).

**Functional Requirements:**

#### FR-4: Per-session and aggregate cost display

The Dashboard shows each Session's token usage and dollar Cost, plus a running total Cost across all Sessions currently listed.

**Consequences (testable):**
- Cost figures shown match the values reported by opencode's own Message/Session data — the Plugin performs no independent pricing calculation.
- The aggregate total updates live as any Session's Cost changes (via `message.updated` or equivalent Events).

**Out of Scope:**
- Per-model cost breakdowns, historical cost trends/charts, and budget-threshold alerts — deferred (§5.2).

**Feature-specific NFRs:**
- Cost display must never diverge from opencode's own reported figures — no caching stale values across a value change without the corresponding Event.

### 4.4 Configuration

**Description:** A small set of options users can set via `opencode.json`, since this Plugin is intended for other opencode users, not only its author.

**Functional Requirements:**

#### FR-5: Basic plugin configuration

Users can configure: the Dashboard's local port, whether Auto-Launch (FR-1) is enabled, and the bind address the local web server listens on.

**Consequences (testable):**
- Default bind address is `127.0.0.1` (localhost-only) — binding to `0.0.0.0` or another interface requires an explicit opt-in setting (see §Constraints — Privacy/Security).
- Setting `autoLaunch: false` suppresses FR-1 entirely without breaking any other Feature (a manual way to reach the Dashboard URL/port is still documented).
- An invalid or already-in-use configured port fails gracefully per FR-1's consequence (opencode startup is not blocked).

## 5. Scope Boundaries

### 5.1 Never (Non-Goals)

- Not a replacement for opencode's TUI or Web UI conversation view — the Dashboard shows status and cost; drilling into a Session's full conversation stays in opencode's own TUI/share view.
- Not a cross-project or cross-machine fleet manager — scoped to one project's Server instance per explicit user decision (§2.2); revisit only if strong demand emerges.
- Not a billing/invoicing/export tool — no historical reports, no CSV/PDF export, no accounting integration.
- Not a remote/shared/multi-user dashboard — no authentication, no accounts, single local user by design.
- Not a general project-management or task-tracking tool — any todo/task display mirrors opencode's own Session todo state; it does not add new task types.
- Does not recompute, cache independently, or override opencode's cost/pricing data.
- No telemetry or analytics collection, in any version — conflicts with the local-only privacy stance (§8).

### 5.2 Deferred (Out of Scope for MVP — may ship later)

- Per-model cost breakdowns and historical cost trend charts.
- Current todo/task display and git diff/file-change stats per session — nice-to-have signals identified during discovery, not required for the core JTBD (status + cost).
- Budget-threshold alerts/notifications (for example, "warn me above $X") — `[NOTE FOR PM]` plausible high-value v2 candidate given the cost-visibility JTBD.
- Manual re-open command for the Dashboard after the browser tab is closed — pending Open Question 1.

## 6. MVP Scope (In Scope)

- Auto-launch of the Dashboard on opencode startup (FR-1).
- Live list of all Sessions in the current Project with Session Status, message count, last activity (FR-2, FR-3).
- Per-session and aggregate Cost display (FR-4).
- Basic configuration: port, auto-launch toggle, bind address (FR-5).
- Localhost-only binding by default (security default, not opt-in).

## 7. Cross-Cutting NFRs

- **Performance:** Plugin initialization adds negligible, sub-second overhead to opencode startup. Dashboard first paint under [ASSUMPTION: 2 seconds] on localhost. Live update propagation (Event → visible UI change) under [ASSUMPTION: 1 second].
- **Compatibility:** Runs on every OS opencode itself supports (macOS, Linux, Windows — WSL recommended per opencode's own docs), under the Bun runtime opencode uses to load plugins.
- **Reliability:** see FR-1's failure-handling consequence (local web server bind failures are non-fatal to opencode).
- **Scalability (practical, not theoretical):** Remains usable at the realistic upper bound of concurrent Sessions a single developer drives in one project — [ASSUMPTION: up to ~10-15 concurrent Sessions] without visible lag in the live list.

## 8. Constraints and Guardrails

**Privacy**
- Session content and Cost data never leave the local machine — no telemetry, no analytics, no external calls beyond what opencode itself already makes to model providers.
- Dashboard binds to `127.0.0.1` by default; exposing it on other network interfaces requires an explicit, documented opt-in (FR-5) — Session content can include sensitive project code and should not be casually network-exposed.

**Security**
- Session content rendered in the Dashboard (titles, messages if ever surfaced) must be treated as untrusted for rendering purposes — no unescaped HTML injection from Session data into the Dashboard page.
- No authentication is planned for MVP given the localhost-only default; this constraint becomes load-bearing if/when non-default network binding is used — `[NOTE FOR PM]` revisit before ever defaulting bind address to non-localhost.

**Cost**
- The Plugin must never present a Cost figure it computed independently of opencode's own reporting — protects against pricing drift when providers change rates (§4.3).

## 9. Developer Product Details

*(This is a developer-facing product: an installable opencode plugin, published for other opencode users — the following applies per user's explicit "others will use this" scoping decision.)*

- **Public surface:** The npm-published plugin package (installed via `opencode.json`'s `plugin` array, per opencode's plugin-loading convention); its configuration surface (FR-5 options) exposed through the same `opencode.json`.
- **API contract:** Consumes opencode's Server APIs (session list/status, message data) and Event bus via the `@opencode-ai/plugin` SDK `client` — no APIs of the Plugin's own are exposed to other tools in v1.
- **Versioning:** Semver; the plugin declares a minimum compatible opencode version. A breaking change in opencode's plugin/event API surface is treated as a breaking change for this Plugin (major version bump).
- **Runtime target:** TypeScript, running under Bun (opencode's plugin runtime); no native/OS-specific dependencies beyond what opencode itself already requires.

## 10. Success Metrics

*As an open-source developer plugin with no telemetry (§Constraints — Privacy), success is measured via public adoption signals, not in-product analytics.*

**Primary**
- **SM-1**: Dashboard first paint and live-update latency meet the budgets in §7 (2s / 1s) — validates FR-1, FR-3.
- **SM-2**: Plugin is installed and used without opencode-startup regressions reported by users — validates FR-1's NFR.

**Secondary**
- **SM-3**: Sustained npm download / GitHub star growth over the first 3 months post-publish, as a public-adoption proxy — no FR maps 1:1, but validates the overall Vision.

**Counter-metrics (do not optimize)**
- **SM-C1**: Do not add scope (cross-project aggregation, transcript viewing, telemetry) to chase adoption growth (SM-3) at the cost of the narrow, local-only, low-overhead product this PRD defines (§5.1). Counterbalances SM-3.

## 11. Open Questions

1. **Manual re-open path.** If the user closes the Dashboard's browser tab, should there be a way to reopen it (a slash command, a keybind) without restarting opencode? Currently out of MVP scope (§5.2) but may be a fast-follow.
2. **Cost reconciliation.** Is opencode's built-in Cost computation considered authoritative enough to publish as-is (§4.3), or are there known cases (for example, provider-side rounding, cached-token discounts) where it's known to diverge from what a provider actually bills?

## 12. Assumptions Index

- §4.1 (FR-1) — Auto-launch latency budget assumed at 3 seconds (not independently benchmarked).
- §4.2 (FR-2) / §7 — Live-update propagation latency budget assumed at 1 second (single figure, referenced in both sections).
- §7 — Dashboard first-paint budget assumed at 2 seconds; concurrent-session scalability target assumed at ~10-15 sessions.
- §4.1 — Plugin startup overhead assumed sub-second, not independently benchmarked against a target number.
</content>
