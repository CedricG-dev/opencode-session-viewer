import { html, render } from "htm/preact";
import { connect, sessions } from "./store.js";
import { SessionRow } from "./components/SessionRow.js";
import { AggregateTotal } from "./components/AggregateTotal.js";
import { DisconnectedIndicator } from "./components/DisconnectedIndicator.js";

/** CAP-1's auto-launch means this empty state (dashboard open before any session exists) is the
 * common initial view, not a rare edge case -- render a visible placeholder row, never a blank
 * `<tbody>`. */
export function App() {
  return html`
    <div>
      <${DisconnectedIndicator} />
      <table>
        <thead>
          <tr>
            <th>Title</th>
            <th>Status</th>
            <th>Messages</th>
            <th>Last Activity</th>
            <th>Tokens</th>
            <th>Cost</th>
            <th>Error</th>
          </tr>
        </thead>
        <tbody>
          ${sessions.value.length === 0
            ? html`<tr>
                <td colspan="7">No sessions yet</td>
              </tr>`
            : sessions.value.map((session) => html`<${SessionRow} key=${session.id} ...${session} />`)}
        </tbody>
      </table>
      <${AggregateTotal} />
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
