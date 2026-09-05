import { html } from "htm/preact";
import type { ModelUsage } from "../../core/view-model.js";
import { fmt, fmtCost } from "../format.js";

/**
 * Shared "by model" breakdown, rendered at every level that has a `ModelUsage[]` (top-level
 * aggregate, session total, session own-usage, sub-session).
 *
 * - 0 models: renders nothing.
 * - 1 model: a single name-only line -- its tokens/cost already equal the scope's own
 *   Total/Own Usage numbers, so repeating them here would be pure duplication. The name is still
 *   shown (never hidden) since knowing *which* model/provider was used is the point of this
 *   feature even in the common single-model case.
 * - 2+ models: the full per-model breakdown, collapsed by default (native `<details>`, no JS) --
 *   this is the only case where the numbers actually add information over the scope's total.
 */
export function ModelUsageList({ models, label }: { models: ModelUsage[]; label: string }) {
  if (models.length === 0) return null;

  if (models.length === 1) {
    const [only] = models as [ModelUsage];
    return html`<p class="session-card__field">Model: <span class="field-value">${only.providerID} / ${only.modelID}</span></p>`;
  }

  return html`
    <details class="model-usage">
      <summary class="model-usage-label">${label} (${models.length})</summary>
      <ul class="model-usage-list">
        ${models.map(
          (m) => html`
            <li class="model-usage-row" key=${`${m.providerID}/${m.modelID}`}>
              <span class="model-usage-name"><strong>${m.providerID}</strong> / ${m.modelID}</span>
              <span class="session-card__field">Input: <span class="field-value">${fmt(m.tokens.input)}</span></span>
              <span class="session-card__field">Output: <span class="field-value">${fmt(m.tokens.output)}</span></span>
              <span class="session-card__field">Reasoning: <span class="field-value">${fmt(m.tokens.reasoning)}</span></span>
              <span class="session-card__field">Cache R/W: <span class="field-value">${fmt(m.tokens.cache.read)}/${fmt(m.tokens.cache.write)}</span></span>
              <span class="session-card__field">Cost: <span class="value-badge value-badge--cost">$${fmtCost(m.cost)}</span></span>
            </li>
          `,
        )}
      </ul>
    </details>
  `;
}
