import type { Session, Message } from "@opencode-ai/sdk";

/** Session status surfaced to the dashboard. Never "error" — see errorFlag/errorMessage. */
export type SessionStatusValue = "idle" | "busy" | "retry";

/**
 * Raw per-session state, private to core/. Mutated only by state-store.ts event handlers.
 */
export type SessionState = {
  session: Session;
  messages: Map<string, Message>;
  status: SessionStatusValue;
  errorFlag: boolean;
  errorMessage?: string;
};

/** Per-category token breakdown, same shape as `AssistantMessage.tokens` (AD-3). */
export type TokenBreakdown = {
  input: number;
  output: number;
  reasoning: number;
  cache: { read: number; write: number };
};

export const ZERO_TOKENS: TokenBreakdown = { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } };

/** Exported for `dashboard/model-filter.ts`'s re-summing of a filtered `ModelUsage[]` subset --
 * same trivial merge, just reused instead of duplicated. */
export function addTokens(a: TokenBreakdown, b: TokenBreakdown): TokenBreakdown {
  return {
    input: a.input + b.input,
    output: a.output + b.output,
    reasoning: a.reasoning + b.reasoning,
    cache: { read: a.cache.read + b.cache.read, write: a.cache.write + b.cache.write },
  };
}

/** Sum across all five categories -- shared by every place that renders a token total (dashboard). */
export function tokenTotal(tokens: TokenBreakdown): number {
  return tokens.input + tokens.output + tokens.reasoning + tokens.cache.read + tokens.cache.write;
}

/** Per-model/provider slice of tokens+cost, keyed by the pair (a session can switch models mid-run). */
export type ModelUsage = {
  providerID: string;
  modelID: string;
  tokens: TokenBreakdown;
  cost: number;
};

function modelKey(m: { providerID: string; modelID: string }): string {
  return `${m.providerID}\u0000${m.modelID}`;
}

/** Deterministic order for rendering: biggest spender first, ties broken by id so output never
 * reorders between otherwise-identical calls. */
function byCostDesc(a: ModelUsage, b: ModelUsage): number {
  return b.cost - a.cost || modelKey(a).localeCompare(modelKey(b));
}

/**
 * Flattens any number of per-model breakdown arrays into one, summing entries that share the same
 * providerID+modelID (e.g. own + every child's, or every top-level session's for the dashboard
 * aggregate). Pure merge only -- never recomputes a value opencode didn't already report (AD-2).
 */
export function mergeModelUsage(lists: ModelUsage[][]): ModelUsage[] {
  const map = new Map<string, ModelUsage>();
  for (const entry of lists.flat()) {
    const key = modelKey(entry);
    const existing = map.get(key);
    map.set(
      key,
      existing
        ? { ...existing, tokens: addTokens(existing.tokens, entry.tokens), cost: existing.cost + entry.cost }
        : entry,
    );
  }
  return Array.from(map.values()).sort(byCostDesc);
}

/**
 * One sub-session's own contribution, nested under its root's `ViewModel.children`. A sub-session
 * (`Session.parentID` set -- created when a subagent runs via the Task tool) never gets its own
 * top-level `ViewModel`; it's always rolled into its root ancestor instead (Design Notes).
 */
export type SubSessionSummary = {
  id: string;
  title: string;
  status: SessionStatusValue;
  tokens: TokenBreakdown;
  cost: number;
  models: ModelUsage[];
  messageCount: number;
  lastActivity: string;
  errorFlag: boolean;
  errorMessage?: string;
};

/**
 * The wire-format view model, per architecture AD-3. Sums tokens/cost from opencode's own
 * reported per-assistant-message data — never independently computed (AD-2). `tokens`/`cost` are
 * the rolled-up grand total (this session's own + every descendant sub-session's, exactly once
 * each) for the card's top-of-card summary; `ownTokens`/`ownCost` are this session's own
 * contribution only, for the "own usage" detail section (Design Notes). `messageCount` is this
 * session's own conversation length only -- each sub-session's own count is on its `children`
 * entry instead.
 */
export type ViewModel = {
  id: string;
  title: string;
  /** Absolute path opencode was run from (`Session.directory`), for display only. Sub-sessions
   * always inherit their root's, so it's not repeated per `SubSessionSummary` entry. */
  directory: string;
  status: SessionStatusValue;
  tokens: TokenBreakdown;
  cost: number;
  models: ModelUsage[];
  ownTokens: TokenBreakdown;
  ownCost: number;
  ownModels: ModelUsage[];
  messageCount: number;
  lastActivity: string;
  errorFlag: boolean;
  errorMessage?: string;
  children: SubSessionSummary[];
};

/**
 * This session's own tokens/cost, re-summed fresh from its messages map on every call so a later
 * `message.updated` for the same messageID naturally replaces, never adds to, an earlier value.
 */
function ownTotals(state: SessionState): { tokens: TokenBreakdown; cost: number; models: ModelUsage[] } {
  let tokens = ZERO_TOKENS;
  let cost = 0;
  const modelMap = new Map<string, ModelUsage>();

  for (const message of state.messages.values()) {
    if (message.role !== "assistant") continue;
    tokens = addTokens(tokens, message.tokens);
    cost += message.cost;

    const key = modelKey(message);
    const existing = modelMap.get(key);
    modelMap.set(
      key,
      existing
        ? { ...existing, tokens: addTokens(existing.tokens, message.tokens), cost: existing.cost + message.cost }
        : { providerID: message.providerID, modelID: message.modelID, tokens: message.tokens, cost: message.cost },
    );
  }

  return { tokens, cost, models: Array.from(modelMap.values()).sort(byCostDesc) };
}

function byCreatedThenId(a: SessionState, b: SessionState): number {
  return a.session.time.created - b.session.time.created || a.session.id.localeCompare(b.session.id);
}

/**
 * Walks `parentID` pointers up to the top-most ancestor that's either root (no `parentID`) or
 * whose parent isn't currently tracked -- an orphaned sub-session is promoted to root rather than
 * silently dropped. The `seen` guard makes a `parentID` cycle a no-op instead of an infinite loop;
 * opencode itself should never produce one, but a store derived from a live event stream
 * shouldn't hang if it somehow did.
 */
function findRootId(id: string, sessions: Map<string, SessionState>): string {
  let currentId = id;
  const seen = new Set<string>();
  for (;;) {
    const parentID = sessions.get(currentId)?.session.parentID;
    if (!parentID || !sessions.has(parentID) || seen.has(parentID)) return currentId;
    seen.add(currentId);
    currentId = parentID;
  }
}

/**
 * Pure derivation from the full raw-state map (Design Notes: sub-session rollup). Only root
 * sessions -- no `parentID`, or an untracked one -- produce a top-level `ViewModel`; every other
 * session flattens into its root's `children` regardless of how many `parentID` hops separate
 * them, with its tokens/cost added into the root's totals exactly once. Sorted by session creation
 * time ascending (ties break on id ascending) for a stable, deterministic order.
 */
export function buildViewModels(sessions: Map<string, SessionState>): ViewModel[] {
  const roots = new Map<string, SessionState>();
  const childStatesByRoot = new Map<string, SessionState[]>();

  for (const [id, state] of sessions) {
    const rootId = findRootId(id, sessions);
    if (rootId === id) {
      roots.set(id, state);
    } else {
      const list = childStatesByRoot.get(rootId) ?? [];
      list.push(state);
      childStatesByRoot.set(rootId, list);
    }
  }

  const sortedRoots = Array.from(roots.values()).sort(byCreatedThenId);

  return sortedRoots.map((rootState) => {
    const own = ownTotals(rootState);
    const childStates = (childStatesByRoot.get(rootState.session.id) ?? []).sort(byCreatedThenId);

    const children: SubSessionSummary[] = childStates.map((state) => {
      const childOwn = ownTotals(state);
      return {
        id: state.session.id,
        title: state.session.title,
        status: state.status,
        tokens: childOwn.tokens,
        cost: childOwn.cost,
        models: childOwn.models,
        messageCount: state.messages.size,
        lastActivity: new Date(state.session.time.updated).toISOString(),
        errorFlag: state.errorFlag,
        errorMessage: state.errorMessage,
      };
    });

    return {
      id: rootState.session.id,
      title: rootState.session.title,
      directory: rootState.session.directory,
      status: rootState.status,
      tokens: children.reduce((sum, child) => addTokens(sum, child.tokens), own.tokens),
      cost: children.reduce((sum, child) => sum + child.cost, own.cost),
      models: mergeModelUsage([own.models, ...children.map((child) => child.models)]),
      ownTokens: own.tokens,
      ownCost: own.cost,
      ownModels: own.models,
      messageCount: rootState.messages.size,
      lastActivity: new Date(rootState.session.time.updated).toISOString(),
      errorFlag: rootState.errorFlag,
      errorMessage: rootState.errorMessage,
      children,
    };
  });
}
