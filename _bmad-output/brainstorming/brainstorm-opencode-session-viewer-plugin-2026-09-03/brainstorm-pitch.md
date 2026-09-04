# OpenCode Session Viewer — Mission Control for Your Agents

**One-liner:** Install a plugin, get a live dashboard — every OpenCode session, its cost, and what it's doing right now, at a glance.

## The Problem

You run more than one OpenCode session. Maybe three, maybe five, all humming away in different terminals. Then the bill shows up and you have no idea which one burned through your budget, or when. Worse — when sessions run concurrently, you're flying blind on progress too: is session #3 stuck, or just working? You end up alt-tabbing between terminals like it's 2005, piecing together cost and status by hand. That's not a workflow, that's an anxiety loop.

## The Solution

The plugin turns on a **mission control grid** — every active session as a live card: running cost, a cost sparkline, and the current task, updating in real time. See something expensive or stuck? Click the card. It expands in place into the full detail view — cost breakdown, task list — while the rest of the grid tucks into a thin sidebar, one click away. No dashboard to deploy, no server to run separately, no config. Install the plugin, open a session, the viewer is just *there*.

## Standout Features (v1)

- **Live grid overview** — every session as a card, at a glance, from the moment you have more than one running.
- **Cost total + sparkline per session** — watch the burn happen, not just the final number.
- **Task progress per card** — know what each session is doing without switching terminals.
- **Click-to-expand focus view** — zoom into one session's full detail without losing sight of the rest.
- **Transparent cost receipts** — hover any cost number to see the model, the rate per token type, and the token counts behind it. No black box, no "just trust the number."
- **Priciest-session auto-flag** — the most expensive card visually pops, so you spot the budget risk without sorting anything.

## Why the Architecture Is Clever

The plugin runs *inside* the OpenCode host process, so instead of shipping a separate server to deploy and babysit, **the plugin IS the server**: it spins up a tiny stdlib-only HTTP server on first session, reuses it for the rest, and shuts itself down when the last session closes. A lockfile with port+PID lets new sessions join the existing server or claim a fresh one — no config, no persistent store, no bidirectional control to secure. Live updates ride over plain SSE, not WebSockets, because the browser never needs to talk back. The result: installing the plugin *is* installing the viewer. Nothing else to set up, nothing else to trust.

## Why This Matters

Minimal install friction and the budget-conscious user's fear are the same anxiety wearing two hats. A tool this small, this transparent, and this zero-friction is one people actually turn on — and once it's on, you'll wonder how you tracked concurrent sessions without it.
