# Brainstorm Intent: OpenCode Session-Viewer Plugin

## Concept
An OpenCode plugin that auto-launches an external web dashboard showing live cost and task-progress info across multiple concurrent OpenCode sessions.

## Core Problem / Job-to-Be-Done
Track cost across multiple sessions, and when sessions run concurrently, see each one's task progress at a glance.

## Key Architecture Decisions
- Single-page app; no persistent data store for v1 — in-memory/session-lifetime state only.
- Primary constraint: minimal install friction. The plugin IS the server — it runs inside the OpenCode host process and spins up a tiny built-in HTTP server (stdlib only, zero new deps) on first session, reusing it after. Installing the plugin = installing the viewer.
- SSE (EventSource) for live push to the UI; plain HTTP endpoints for UI actions (e.g. focus-switch). No WebSocket — browser never needs to push data back. No bidirectional control (no pause/kill from dashboard).
- Discovery via fixed/free port picked by the first plugin instance. A lockfile in the temp dir stores port+PID; new instances check if the PID is alive before joining vs. re-claiming a fresh port. The last session out deletes the lockfile and shuts the server down.

## V1 Scope (MoSCoW)
- **Must**: grid overview of live sessions; cost total + sparkline per session; task list per session; click-to-expand focus view (card expands in-place, rest of grid collapses to a thin sidebar rail).
- **Should**: cost "receipt" tooltip on hover (model name, rate per token type, counts per type in/out/cache); auto-flag the priciest session visually (color/badge).
- **Could**: auto-sort sessions by cost burn rate or "stuck" status (no progress in N minutes); stuck detection.
- **Won't-this-time**: bidirectional control (no pause/kill from dashboard); persistence (no data store beyond session lifetime).

## Critical Insight
"Minimal install friction" and the budget-conscious user's fear are the same anxiety wearing two hats. The whole design — zero-dep server, no persistence, transparent cost receipts — optimizes for a tool small enough and honest enough to trust immediately.
