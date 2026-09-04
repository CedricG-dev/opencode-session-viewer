import { describe, expect, test } from "bun:test";
import type {
  AssistantMessage,
  EventMessageUpdated,
  EventSessionCreated,
  EventSessionError,
  EventSessionIdle,
  EventSessionStatus,
  EventSessionUpdated,
  Session,
  UserMessage,
} from "@opencode-ai/sdk";
import {
  getViewModel,
  getViewModels,
  handleMessageUpdated,
  handleSessionCreated,
  handleSessionError,
  handleSessionIdle,
  handleSessionStatus,
  handleSessionUpdated,
} from "./state-store.js";

function makeSession(id: string, overrides: Partial<Session> = {}): Session {
  return {
    id,
    projectID: "proj-1",
    directory: "/tmp/proj",
    title: `Session ${id}`,
    version: "1",
    time: { created: 1, updated: 1 },
    ...overrides,
  };
}

function makeSessionCreated(id: string, overrides: Partial<Session> = {}): EventSessionCreated {
  return { type: "session.created", properties: { info: makeSession(id, overrides) } };
}

function makeSessionUpdated(id: string, overrides: Partial<Session> = {}): EventSessionUpdated {
  return { type: "session.updated", properties: { info: makeSession(id, overrides) } };
}

function makeUserMessage(sessionID: string, messageID: string): EventMessageUpdated {
  const message: UserMessage = {
    id: messageID,
    sessionID,
    role: "user",
    time: { created: 1 },
    agent: "build",
    model: { providerID: "provider-1", modelID: "model-1" },
  };
  return { type: "message.updated", properties: { info: message } };
}

function makeAssistantMessage(
  id: string,
  sessionID: string,
  messageID: string,
  cost: number,
  tokens: number,
): EventMessageUpdated {
  const message: AssistantMessage = {
    id: messageID,
    sessionID,
    role: "assistant",
    time: { created: 1 },
    parentID: "user-1",
    modelID: "model-1",
    providerID: "provider-1",
    mode: "build",
    path: { cwd: "/tmp/proj", root: "/tmp/proj" },
    cost,
    tokens: { input: tokens, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
  };
  return { type: "message.updated", properties: { info: message } };
}

describe("state-store", () => {
  test("new session: session.created for an unknown id populates the store with idle defaults", () => {
    handleSessionCreated(makeSessionCreated("s-new"));

    expect(getViewModel("s-new")).toEqual({
      id: "s-new",
      title: "Session s-new",
      status: "idle",
      tokens: 0,
      cost: 0,
      messageCount: 0,
      lastActivity: new Date(1).toISOString(),
      errorFlag: false,
      errorMessage: undefined,
    });
  });

  test("status change: session.status updates status for a known id, leaves other fields unchanged", () => {
    handleSessionCreated(makeSessionCreated("s-status"));

    const event: EventSessionStatus = {
      type: "session.status",
      properties: { sessionID: "s-status", status: { type: "busy" } },
    };
    handleSessionStatus(event);

    expect(getViewModel("s-status")?.status).toBe("busy");
    expect(getViewModel("s-status")?.messageCount).toBe(0);
  });

  test("status change: session.status for an unknown id is a no-op", () => {
    const event: EventSessionStatus = {
      type: "session.status",
      properties: { sessionID: "s-never-created", status: { type: "busy" } },
    };
    handleSessionStatus(event);

    expect(getViewModel("s-never-created")).toBeUndefined();
  });

  test("assistant message updates twice: second derive reflects only the latest cost/tokens, no double-count", () => {
    handleSessionCreated(makeSessionCreated("s-stream"));

    handleMessageUpdated(makeAssistantMessage("m1", "s-stream", "msg-1", 0.01, 10));
    handleMessageUpdated(makeAssistantMessage("m1", "s-stream", "msg-1", 0.05, 50));

    const vm = getViewModel("s-stream");
    expect(vm?.cost).toBe(0.05);
    expect(vm?.tokens).toBe(50);
    expect(vm?.messageCount).toBe(1);
  });

  test("session error: sets errorFlag and a non-empty errorMessage from the error's message", () => {
    handleSessionCreated(makeSessionCreated("s-error"));

    const event: EventSessionError = {
      type: "session.error",
      properties: {
        sessionID: "s-error",
        error: { name: "UnknownError", data: { message: "boom" } },
      },
    };
    handleSessionError(event);

    const vm = getViewModel("s-error");
    expect(vm?.errorFlag).toBe(true);
    expect(vm?.errorMessage).toBe("boom");
  });

  test("session error: missing sessionID is ignored, no synthetic attribution", () => {
    const event: EventSessionError = {
      type: "session.error",
      properties: { error: { name: "UnknownError", data: { message: "boom" } } },
    };
    // Should not throw and should not create/affect any session entry.
    expect(() => handleSessionError(event)).not.toThrow();
  });

  test("unknown session referenced: message.updated for a never-seen id never fabricates a session", () => {
    handleMessageUpdated(makeAssistantMessage("m2", "s-never-seen", "msg-2", 1, 100));

    expect(getViewModel("s-never-seen")).toBeUndefined();
  });

  test("unknown session referenced: session.error for a never-seen id never fabricates a session", () => {
    const event: EventSessionError = {
      type: "session.error",
      properties: {
        sessionID: "s-never-seen-error",
        error: { name: "UnknownError", data: { message: "boom" } },
      },
    };
    handleSessionError(event);

    expect(getViewModel("s-never-seen-error")).toBeUndefined();
  });

  test("session.updated on a known id: replaces session info only, preserves status/messages/errorFlag/errorMessage", () => {
    handleSessionCreated(makeSessionCreated("s-updated-known"));
    handleSessionStatus({
      type: "session.status",
      properties: { sessionID: "s-updated-known", status: { type: "busy" } },
    });
    handleMessageUpdated(makeAssistantMessage("m1", "s-updated-known", "msg-1", 0.02, 20));
    handleSessionError({
      type: "session.error",
      properties: { sessionID: "s-updated-known", error: { name: "UnknownError", data: { message: "boom" } } },
    });

    handleSessionUpdated(makeSessionUpdated("s-updated-known", { title: "Renamed" }));

    const vm = getViewModel("s-updated-known");
    expect(vm?.title).toBe("Renamed");
    expect(vm?.status).toBe("busy");
    expect(vm?.messageCount).toBe(1);
    expect(vm?.cost).toBe(0.02);
    expect(vm?.errorFlag).toBe(true);
    expect(vm?.errorMessage).toBe("boom");
  });

  test("session.updated on an unknown id: discovery path creates a new entry defaulting to idle", () => {
    handleSessionUpdated(makeSessionUpdated("s-updated-unknown"));

    expect(getViewModel("s-updated-unknown")).toEqual({
      id: "s-updated-unknown",
      title: "Session s-updated-unknown",
      status: "idle",
      tokens: 0,
      cost: 0,
      messageCount: 0,
      lastActivity: new Date(1).toISOString(),
      errorFlag: false,
      errorMessage: undefined,
    });
  });

  test("session.idle on a known id: transitions status from busy back to idle", () => {
    handleSessionCreated(makeSessionCreated("s-idle-known"));
    handleSessionStatus({
      type: "session.status",
      properties: { sessionID: "s-idle-known", status: { type: "busy" } },
    });
    expect(getViewModel("s-idle-known")?.status).toBe("busy");

    const event: EventSessionIdle = { type: "session.idle", properties: { sessionID: "s-idle-known" } };
    handleSessionIdle(event);

    expect(getViewModel("s-idle-known")?.status).toBe("idle");
  });

  test("session.idle on an unknown id: no-op", () => {
    const event: EventSessionIdle = { type: "session.idle", properties: { sessionID: "s-idle-unknown" } };
    handleSessionIdle(event);

    expect(getViewModel("s-idle-unknown")).toBeUndefined();
  });

  test("session.created called twice for the same id is idempotent: does not reset mutated status/messages", () => {
    handleSessionCreated(makeSessionCreated("s-created-twice"));
    handleSessionStatus({
      type: "session.status",
      properties: { sessionID: "s-created-twice", status: { type: "busy" } },
    });
    handleMessageUpdated(makeAssistantMessage("m1", "s-created-twice", "msg-1", 0.03, 30));

    handleSessionCreated(makeSessionCreated("s-created-twice"));

    const vm = getViewModel("s-created-twice");
    expect(vm?.status).toBe("busy");
    expect(vm?.messageCount).toBe(1);
    expect(vm?.cost).toBe(0.03);
  });

  test("non-assistant messages are excluded from tokens/cost aggregation but counted in messageCount", () => {
    handleSessionCreated(makeSessionCreated("s-mixed-messages"));

    handleMessageUpdated(makeUserMessage("s-mixed-messages", "user-msg-1"));
    handleMessageUpdated(makeAssistantMessage("m1", "s-mixed-messages", "assistant-msg-1", 0.04, 40));

    const vm = getViewModel("s-mixed-messages");
    expect(vm?.tokens).toBe(40);
    expect(vm?.cost).toBe(0.04);
    expect(vm?.messageCount).toBe(2);
  });

  test("extractErrorMessage fallback: no string message in error.data falls back to error.name", () => {
    handleSessionCreated(makeSessionCreated("s-error-fallback"));

    handleSessionError({
      type: "session.error",
      properties: { sessionID: "s-error-fallback", error: { name: "MessageOutputLengthError", data: {} } },
    });

    expect(getViewModel("s-error-fallback")?.errorMessage).toBe("MessageOutputLengthError");
  });

  test("extractErrorMessage fallback: empty-string message in error.data falls back to error.name", () => {
    handleSessionCreated(makeSessionCreated("s-error-empty-message"));

    handleSessionError({
      type: "session.error",
      properties: {
        sessionID: "s-error-empty-message",
        error: { name: "UnknownError", data: { message: "" } },
      },
    });

    expect(getViewModel("s-error-empty-message")?.errorMessage).toBe("UnknownError");
  });

  test("getViewModels: returns every known session, matching what getViewModel(id) returns", () => {
    handleSessionCreated(makeSessionCreated("s-all-1"));
    handleSessionCreated(makeSessionCreated("s-all-2"));

    const all = getViewModels();
    const byId = new Map(all.map((vm) => [vm.id, vm]));

    expect(byId.get("s-all-1")).toEqual(getViewModel("s-all-1"));
    expect(byId.get("s-all-2")).toEqual(getViewModel("s-all-2"));
  });
});
