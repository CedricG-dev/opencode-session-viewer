import type {
  EventSessionCreated,
  EventSessionUpdated,
  EventSessionStatus,
  EventSessionIdle,
  EventSessionError,
  EventMessageUpdated,
} from "@opencode-ai/sdk";
import type { SessionState, ViewModel } from "./view-model.js";
import { deriveViewModel } from "./view-model.js";

/** Module-private, in-memory read model. Starts empty; populated only by the handlers below (AD-2). */
const sessions = new Map<string, SessionState>();

type SessionErrorUnion = NonNullable<EventSessionError["properties"]["error"]>;

/** `.data.message` when present, else the error's `name` (Design Notes). */
function extractErrorMessage(error: SessionErrorUnion): string {
  const data = error.data as { message?: unknown };
  return typeof data.message === "string" && data.message.length > 0 ? data.message : error.name;
}

export function handleSessionCreated(event: EventSessionCreated): void {
  const { info } = event.properties;
  if (sessions.has(info.id)) return;
  sessions.set(info.id, {
    session: info,
    messages: new Map(),
    status: "idle",
    errorFlag: false,
  });
}

export function handleSessionUpdated(event: EventSessionUpdated): void {
  const { info } = event.properties;
  const state = sessions.get(info.id);
  if (!state) {
    // session.updated for a never-seen id: treat as discovery, per AD-2 conservative default.
    sessions.set(info.id, {
      session: info,
      messages: new Map(),
      status: "idle",
      errorFlag: false,
    });
    return;
  }
  state.session = info;
}

export function handleSessionStatus(event: EventSessionStatus): void {
  const state = sessions.get(event.properties.sessionID);
  if (!state) return;
  state.status = event.properties.status.type;
}

export function handleSessionIdle(event: EventSessionIdle): void {
  const state = sessions.get(event.properties.sessionID);
  if (!state) return;
  state.status = "idle";
}

export function handleSessionError(event: EventSessionError): void {
  const { sessionID, error } = event.properties;
  if (!sessionID) return;
  const state = sessions.get(sessionID);
  if (!state) return;
  state.errorFlag = true;
  state.errorMessage = error ? extractErrorMessage(error) : "Unknown error";
}

export function handleMessageUpdated(event: EventMessageUpdated): void {
  const message = event.properties.info;
  const state = sessions.get(message.sessionID);
  if (!state) return;
  state.messages.set(message.id, message);
}

/**
 * Sorted by session creation time ascending, so the list order is stable and chronological.
 * Ties (identical `time.created`) break on `id` ascending, so the order is deterministic rather
 * than relying incidentally on `Array.prototype.sort`'s stability guarantee.
 */
export function getViewModels(): ViewModel[] {
  return Array.from(sessions.values())
    .sort((a, b) => a.session.time.created - b.session.time.created || a.session.id.localeCompare(b.session.id))
    .map(deriveViewModel);
}

export function getViewModel(id: string): ViewModel | undefined {
  const state = sessions.get(id);
  return state ? deriveViewModel(state) : undefined;
}
