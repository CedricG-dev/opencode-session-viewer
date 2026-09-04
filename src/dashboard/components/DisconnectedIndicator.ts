import { html } from "htm/preact";
import { connected } from "../store.js";

/** Renders only when the SSE connection is down (`connected.value` is `false`). */
export function DisconnectedIndicator() {
  if (connected.value) return null;
  return html`<p role="status">Disconnected</p>`;
}
