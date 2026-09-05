import { html } from "htm/preact";
import { tokenTotal } from "../../core/view-model.js";
import { aggregateCost, aggregateTokens } from "../store.js";
import { fmt, fmtCost } from "../format.js";

/**
 * Live running total across all listed sessions (CAP-4): cost + full token breakdown, formatted
 * to 4 decimals. Renders as a full-width card (`main.ts`) with its own `--total` accent color,
 * distinct from every `SessionCard` status color (Design Notes).
 */
export function AggregateTotal() {
  const tokens = aggregateTokens.value;
  return html`
    <div class="aggregate-card">
      <h3 class="session-card__title">Total</h3>
      <p class="session-card__field">Cost: <span class="value-badge value-badge--cost">$${fmtCost(aggregateCost.value)}</span></p>
      <div class="session-card__tokens">
        <p class="session-card__field">Input: ${fmt(tokens.input)}</p>
        <p class="session-card__field">Output: ${fmt(tokens.output)}</p>
        <p class="session-card__field">Reasoning: ${fmt(tokens.reasoning)}</p>
        <p class="session-card__field">Cache Write: ${fmt(tokens.cache.write)}</p>
        <p class="session-card__field">Cache Read: ${fmt(tokens.cache.read)}</p>
        <p class="session-card__field session-card__field--total">Total Tokens: <span class="value-badge value-badge--tokens">${fmt(tokenTotal(tokens))}</span></p>
      </div>
    </div>
  `;
}
