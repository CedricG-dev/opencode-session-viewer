import { html } from "htm/preact";
import type { ViewModel } from "../../core/view-model.js";

/**
 * One `<tr>` per `ViewModel`. Title/errorMessage render only via htm/preact's auto-escaping text
 * interpolation -- no `dangerouslySetInnerHTML` (untrusted session content, per SPEC.md). The
 * error `<td>` is always present (empty when `errorFlag` is `false`) so every row has the same
 * cell count regardless of error state.
 */
export function SessionRow(viewModel: ViewModel) {
  return html`
    <tr>
      <td>${viewModel.title}</td>
      <td>${viewModel.status}</td>
      <td>${viewModel.messageCount}</td>
      <td>${viewModel.lastActivity}</td>
      <td>${viewModel.tokens.toLocaleString("en-US")}</td>
      <td>${viewModel.cost.toFixed(4)}</td>
      <td>${viewModel.errorFlag ? (viewModel.errorMessage ?? "") : ""}</td>
    </tr>
  `;
}
