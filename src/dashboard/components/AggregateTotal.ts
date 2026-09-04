import { html } from "htm/preact";
import { aggregateCost } from "../store.js";

/** Renders the live running total across all listed sessions (CAP-4), formatted to 4 decimals. */
export function AggregateTotal() {
  return html`<p>Total cost: $${aggregateCost.value.toFixed(4)}</p>`;
}
