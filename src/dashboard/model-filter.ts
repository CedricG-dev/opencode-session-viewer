import { addTokens, mergeModelUsage, ZERO_TOKENS, type ModelUsage, type SubSessionSummary, type TokenBreakdown, type ViewModel } from "../core/view-model.js";

/** Stable string key for a provider/model pair -- `Set<string>` membership for the filter UI. */
export function modelFilterKey(m: { providerID: string; modelID: string }): string {
  return `${m.providerID}::${m.modelID}`;
}

function sumModels(models: ModelUsage[]): { tokens: TokenBreakdown; cost: number } {
  return models.reduce(
    (sum, m) => ({ tokens: addTokens(sum.tokens, m.tokens), cost: sum.cost + m.cost }),
    { tokens: ZERO_TOKENS, cost: 0 },
  );
}

/**
 * Client-side, display-only re-sum of each session's already-reported per-model breakdown,
 * restricted to `selected` (union/OR: a session counts if it used *any* selected model). Never
 * recomputes anything opencode didn't already report (AD-2) -- just adds up a subset of numbers
 * already on the wire. `selected` empty means "All" -- returns `sessions` unchanged.
 *
 * A sub-session is dropped if none of its own models match. A root session is dropped only if
 * *neither* its own usage nor any surviving child matches -- it stays visible (with zeroed own
 * usage) when a child still matches, since a sub-session can't be hosted without its root.
 */
export function filterViewModels(sessions: ViewModel[], selected: Set<string>): ViewModel[] {
  if (selected.size === 0) return sessions;

  const matches = (m: ModelUsage) => selected.has(modelFilterKey(m));

  const filterSub = (sub: SubSessionSummary): SubSessionSummary | undefined => {
    const models = sub.models.filter(matches);
    if (models.length === 0) return undefined;
    const { tokens, cost } = sumModels(models);
    return { ...sub, tokens, cost, models };
  };

  return sessions.flatMap((vm) => {
    const ownModels = vm.ownModels.filter(matches);
    const { tokens: ownTokens, cost: ownCost } = sumModels(ownModels);
    const children = vm.children.map(filterSub).filter((c): c is SubSessionSummary => c !== undefined);

    if (ownModels.length === 0 && children.length === 0) return [];

    const models = mergeModelUsage([ownModels, ...children.map((c) => c.models)]);
    const tokens = children.reduce((sum, c) => addTokens(sum, c.tokens), ownTokens);
    const cost = children.reduce((sum, c) => sum + c.cost, ownCost);

    return [{ ...vm, tokens, cost, models, ownTokens, ownCost, ownModels, children }];
  });
}
