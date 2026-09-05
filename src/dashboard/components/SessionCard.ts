import { html } from "htm/preact";
import { tokenTotal, type SubSessionSummary, type ViewModel } from "../../core/view-model.js";
import { fmt, fmtCost, fmtDate } from "../format.js";

/**
 * One line per sub-session (Design Notes: a sub-session -- `Session.parentID` set, created when a
 * subagent runs via the Task tool -- never gets its own card; it's listed here on its root
 * instead). Shows its own usage only (a sub-session never has further descendants rolled into it,
 * so its own values are already its total). Its own errorFlag is shown inline but never changes
 * the parent `SessionCard`'s accent.
 */
function SubSessionItem(sub: SubSessionSummary) {
  const accent = sub.errorFlag ? "error" : sub.status;
  return html`
    <li class="session-card__subsession">
      <span class="session-card__subsession-arrow" aria-hidden="true">↳</span>
      <span class="session-card__badge session-card__badge--${accent}">${sub.status}</span>
      <span class="session-card__subsession-title">${sub.title}</span>
      <span class="session-card__field">Messages: <span class="field-value">${sub.messageCount}</span></span>
      <span class="session-card__field">Input: <span class="field-value">${fmt(sub.tokens.input)}</span></span>
      <span class="session-card__field">Output: <span class="field-value">${fmt(sub.tokens.output)}</span></span>
      <span class="session-card__field">Reasoning: <span class="field-value">${fmt(sub.tokens.reasoning)}</span></span>
      <span class="session-card__field">Cache R/W: <span class="field-value">${fmt(sub.tokens.cache.read)}/${fmt(sub.tokens.cache.write)}</span></span>
      <span class="session-card__field">Cost: <span class="value-badge value-badge--cost">$${fmtCost(sub.cost)}</span></span>
      ${sub.errorFlag ? html`<span class="session-card__error">${sub.errorMessage ?? ""}</span>` : null}
    </li>
  `;
}

/**
 * One card per `ViewModel` (`main.ts`'s `.session-grid`). Title/errorMessage render only via
 * htm/preact's auto-escaping text interpolation -- no `dangerouslySetInnerHTML` (untrusted
 * session content, per SPEC.md). The error line only renders when `errorFlag` is true (unlike the
 * old table layout, a card has no fixed column count to preserve). The card's left-border accent
 * and the status badge always share one color: `errorFlag` overrides idle/busy/retry since it's
 * the more urgent signal (Design Notes).
 *
 * Layout: Total Tokens/Total Cost (rolled up -- own + every sub-session's) lead the card, right
 * after the badge; further down, "Own Usage" shows this session's own contribution only, matching
 * what each sub-session's own row shows for itself (Design Notes).
 */
export function SessionCard(viewModel: ViewModel) {
  const { ownTokens } = viewModel;
  const accent = viewModel.errorFlag ? "error" : viewModel.status;
  return html`
    <div class="session-card session-card--${accent}">
      <h3 class="session-card__title">${viewModel.title} <span class="session-card__id">${viewModel.id}</span></h3>
      <span class="session-card__badge session-card__badge--${accent}">${viewModel.status}</span>
      <p class="session-card__field session-card__field--total">Total Tokens: <span class="value-badge value-badge--tokens">${fmt(tokenTotal(viewModel.tokens))}</span> Total Cost: <span class="value-badge value-badge--cost">$${fmtCost(viewModel.cost)}</span></p>
      <p class="session-card__field">Messages: <span class="field-value">${viewModel.messageCount}</span> · Last Activity: <span class="field-value">${fmtDate(viewModel.lastActivity)}</span></p>
      <details>
        <summary class="session-card__tokens-label">Own Usage</summary>
        <div class="session-card__tokens">
          <p class="session-card__field">Input: <span class="field-value">${fmt(ownTokens.input)}</span></p>
          <p class="session-card__field">Output: <span class="field-value">${fmt(ownTokens.output)}</span></p>
          <p class="session-card__field">Reasoning: <span class="field-value">${fmt(ownTokens.reasoning)}</span></p>
          <p class="session-card__field">Cache R/W: <span class="field-value">${fmt(ownTokens.cache.read)}/${fmt(ownTokens.cache.write)}</span></p>
          <p class="session-card__field">Cost: <span class="value-badge value-badge--cost">$${fmtCost(viewModel.ownCost)}</span></p>
        </div>
      </details>
      ${viewModel.children.length > 0
        ? html`<div class="session-card__subsessions">
            <p class="session-card__subsessions-label">Sub-sessions (${viewModel.children.length})</p>
            <ul class="session-card__subsessions-list">
              ${viewModel.children.map((child) => html`<${SubSessionItem} key=${child.id} ...${child} />`)}
            </ul>
          </div>`
        : null}
      ${viewModel.errorFlag ? html`<p class="session-card__error">${viewModel.errorMessage ?? ""}</p>` : null}
    </div>
  `;
}
