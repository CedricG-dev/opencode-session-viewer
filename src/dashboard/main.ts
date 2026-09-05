import { html, render } from "htm/preact";
import { connect, sessions } from "./store.js";
import { SessionCard } from "./components/SessionCard.js";
import { AggregateTotal } from "./components/AggregateTotal.js";
import { DisconnectedIndicator } from "./components/DisconnectedIndicator.js";

/** CAP-1's auto-launch means this empty state (dashboard open before any session exists) is the
 * common initial view, not a rare edge case -- render a visible placeholder, never a blank grid. */
export function App() {
  return html`
    <div>
      <${DisconnectedIndicator} />
      <${AggregateTotal} />
      <div class="session-grid">
        ${sessions.value.length === 0
          ? html`<p class="session-grid__empty">No sessions yet</p>`
          : sessions.value.map((session) => html`<${SessionCard} key=${session.id} ...${session} />`)}
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
