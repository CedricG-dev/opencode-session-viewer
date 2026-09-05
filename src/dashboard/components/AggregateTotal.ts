import { html } from "htm/preact";
import { tokenTotal } from "../../core/view-model.js";
import { aggregateCost, aggregateModels, aggregateTokens } from "../store.js";
import { fmt, fmtCost } from "../format.js";
import { ModelUsageList } from "./ModelUsageList.js";

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
        <p class="session-card__field">Input: <span class="field-value">${fmt(tokens.input)}</span></p>
        <p class="session-card__field">Output: <span class="field-value">${fmt(tokens.output)}</span></p>
        <p class="session-card__field">Reasoning: <span class="field-value">${fmt(tokens.reasoning)}</span></p>
        <p class="session-card__field">Cache R/W: <span class="field-value">${fmt(tokens.cache.read)}/${fmt(tokens.cache.write)}</span></p>
        <p class="session-card__field session-card__field--total">Total Tokens: <span class="value-badge value-badge--tokens">${fmt(tokenTotal(tokens))}</span></p>
      </div>
      <${ModelUsageList} models=${aggregateModels.value} label="By Model" />
    </div>
  `;
}
