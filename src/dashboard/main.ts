import { html, render } from "htm/preact";
import { connect, filteredSessions } from "./store.js";
import { SessionCard } from "./components/SessionCard.js";
import { AggregateTotal } from "./components/AggregateTotal.js";
import { DisconnectedIndicator } from "./components/DisconnectedIndicator.js";
import { ModelFilterBar } from "./components/ModelFilterBar.js";

/** CAP-1's auto-launch means this empty state (dashboard open before any session exists) is the
 * common initial view, not a rare edge case -- render a visible placeholder, never a blank grid.
 * The grid renders `filteredSessions` (model filter applied); `AggregateTotal` above it stays on
 * the raw `sessions` signal, so the total card is never affected by the filter. */
export function App() {
  return html`
    <div>
      <h1 class="app-title">Opencode Session Viewer</h1>
      <${DisconnectedIndicator} />
      <${AggregateTotal} />
      <${ModelFilterBar} />
      <div class="session-grid">
        ${filteredSessions.value.length === 0
          ? html`<p class="session-grid__empty">No sessions yet</p>`
          : filteredSessions.value.map((session) => html`<${SessionCard} key=${session.id} ...${session} />`)}
      </div>
    </div>
  `;
}

/** Guarded behind a `document` check so importing this module (e.g. from `main.test.ts`) for
 * `App` alone never tries to open a real `EventSource` or touch a nonexistent DOM. */
if (typeof document !== "undefined") {
  connect();
  const root = document.getElementById("app");
  if (root) render(html`<${App} />`, root);
}
