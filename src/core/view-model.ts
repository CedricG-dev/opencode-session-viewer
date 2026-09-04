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

/**
 * The wire-format view model, per architecture AD-3. Sums tokens/cost from opencode's own
 * reported per-assistant-message data — never independently computed (AD-2).
 */
export type ViewModel = {
  id: string;
  title: string;
  status: SessionStatusValue;
  tokens: number;
  cost: number;
  messageCount: number;
  lastActivity: string;
  errorFlag: boolean;
  errorMessage?: string;
};

/**
 * Pure derivation from raw state. Re-sums tokens/cost from the messages map on every call so a
 * later `message.updated` for the same messageID naturally replaces, never adds to, an earlier value.
 */
export function deriveViewModel(state: SessionState): ViewModel {
  let tokens = 0;
  let cost = 0;

  // messageCount (below) intentionally counts user + assistant messages; tokens/cost only sum assistant messages.
  for (const message of state.messages.values()) {
    if (message.role !== "assistant") continue;
    tokens +=
      message.tokens.input +
      message.tokens.output +
      message.tokens.reasoning +
      message.tokens.cache.read +
      message.tokens.cache.write;
    cost += message.cost;
  }

  return {
    id: state.session.id,
    title: state.session.title,
    status: state.status,
    tokens,
    cost,
    messageCount: state.messages.size,
    lastActivity: new Date(state.session.time.updated).toISOString(),
    errorFlag: state.errorFlag,
    errorMessage: state.errorMessage,
  };
}
