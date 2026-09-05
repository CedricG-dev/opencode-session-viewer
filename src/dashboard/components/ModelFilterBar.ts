import { html } from "htm/preact";
import { modelFilterKey } from "../model-filter.js";
import { aggregateModels, clearModelFilter, selectedModelKeys, toggleModelFilter } from "../store.js";

/**
 * Multi-select model/provider filter for the session grid, rendered between the total card and
 * the grid (`main.ts`). Options come from `aggregateModels` -- the full universe across every
 * session, so a currently-filtered-out model stays selectable. "All" is implicit whenever nothing
 * is selected; renders nothing until at least one model has been seen.
 */
export function ModelFilterBar() {
  const models = aggregateModels.value;
  if (models.length === 0) return null;

  const selected = selectedModelKeys.value;
  return html`
    <div class="model-filter" role="group" aria-label="Filter by model">
      <button
        type="button"
        class="model-filter-chip ${selected.size === 0 ? "model-filter-chip--active" : ""}"
        aria-pressed=${selected.size === 0}
        onClick=${clearModelFilter}
      >
        All
      </button>
      ${models.map((m) => {
        const key = modelFilterKey(m);
        const active = selected.has(key);
        return html`
          <button
            type="button"
            class="model-filter-chip ${active ? "model-filter-chip--active" : ""}"
            aria-pressed=${active}
            onClick=${() => toggleModelFilter(key)}
            key=${key}
          >
            ${m.providerID} / ${m.modelID}
          </button>
        `;
      })}
    </div>
  `;
}
