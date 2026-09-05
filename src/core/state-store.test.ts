import { describe, expect, test } from "vitest";
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
  overrides: { modelID?: string; providerID?: string } = {},
): EventMessageUpdated {
  const message: AssistantMessage = {
    id: messageID,
    sessionID,
    role: "assistant",
    time: { created: 1 },
    parentID: "user-1",
    modelID: overrides.modelID ?? "model-1",
    providerID: overrides.providerID ?? "provider-1",
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
      tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
      cost: 0,
      models: [],
      ownTokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
      ownCost: 0,
      ownModels: [],
      messageCount: 0,
      lastActivity: new Date(1).toISOString(),
      errorFlag: false,
      errorMessage: undefined,
      children: [],
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
    expect(vm?.tokens.input).toBe(50);
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
      tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
      cost: 0,
      models: [],
      ownTokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
      ownCost: 0,
      ownModels: [],
      messageCount: 0,
      lastActivity: new Date(1).toISOString(),
      errorFlag: false,
      errorMessage: undefined,
      children: [],
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
    expect(vm?.tokens.input).toBe(40);
    expect(vm?.cost).toBe(0.04);
    expect(vm?.messageCount).toBe(2);
  });

  test("token breakdown: input/output/reasoning/cache.read/cache.write each sum independently across messages", () => {
    handleSessionCreated(makeSessionCreated("s-token-breakdown"));

    const message = (messageID: string, tokens: AssistantMessage["tokens"]): EventMessageUpdated => ({
      type: "message.updated",
      properties: {
        info: {
          id: messageID,
          sessionID: "s-token-breakdown",
          role: "assistant",
          time: { created: 1 },
          parentID: "user-1",
          modelID: "model-1",
          providerID: "provider-1",
          mode: "build",
          path: { cwd: "/tmp/proj", root: "/tmp/proj" },
          cost: 0,
          tokens,
        },
      },
    });

    handleMessageUpdated(message("msg-1", { input: 10, output: 20, reasoning: 30, cache: { read: 40, write: 50 } }));
    handleMessageUpdated(message("msg-2", { input: 1, output: 2, reasoning: 3, cache: { read: 4, write: 5 } }));

    expect(getViewModel("s-token-breakdown")?.tokens).toEqual({
      input: 11,
      output: 22,
      reasoning: 33,
      cache: { read: 44, write: 55 },
    });
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

  test("getViewModels: sorted by session.time.created ascending, regardless of creation order", () => {
    handleSessionCreated(makeSessionCreated("s-order-later", { time: { created: 300, updated: 300 } }));
    handleSessionCreated(makeSessionCreated("s-order-earliest", { time: { created: 100, updated: 100 } }));
    handleSessionCreated(makeSessionCreated("s-order-middle", { time: { created: 200, updated: 200 } }));

    const ids = getViewModels().map((vm) => vm.id);

    expect(ids.indexOf("s-order-earliest")).toBeLessThan(ids.indexOf("s-order-middle"));
    expect(ids.indexOf("s-order-middle")).toBeLessThan(ids.indexOf("s-order-later"));
  });

  test("getViewModels: identical time.created ties break on id ascending", () => {
    handleSessionCreated(makeSessionCreated("s-tie-b", { time: { created: 500, updated: 500 } }));
    handleSessionCreated(makeSessionCreated("s-tie-a", { time: { created: 500, updated: 500 } }));

    const ids = getViewModels().map((vm) => vm.id);

    expect(ids.indexOf("s-tie-a")).toBeLessThan(ids.indexOf("s-tie-b"));
  });

  describe("sub-sessions (parentID)", () => {
    test("a session with a tracked parentID is nested under its parent, not returned as its own top-level entry", () => {
      handleSessionCreated(makeSessionCreated("s-parent"));
      handleSessionCreated(makeSessionCreated("s-child", { parentID: "s-parent" }));

      const all = getViewModels();
      expect(all.some((vm) => vm.id === "s-child")).toBe(false);
      expect(all.find((vm) => vm.id === "s-parent")?.children.map((child) => child.id)).toEqual(["s-child"]);
    });

    test("parent's tokens/cost = its own + every child's, each summed exactly once", () => {
      handleSessionCreated(makeSessionCreated("s-parent-2"));
      handleSessionCreated(makeSessionCreated("s-child-2", { parentID: "s-parent-2" }));
      handleMessageUpdated(makeAssistantMessage("m1", "s-parent-2", "msg-parent", 1, 100));
      handleMessageUpdated(makeAssistantMessage("m2", "s-child-2", "msg-child", 2, 200));

      const vm = getViewModel("s-parent-2");
      expect(vm?.cost).toBe(3);
      expect(vm?.tokens.input).toBe(300);
      // ownCost/ownTokens stay the parent's own contribution only -- never rolled up, unlike
      // cost/tokens -- so the card's "own usage" section never double-counts a child's own row.
      expect(vm?.ownCost).toBe(1);
      expect(vm?.ownTokens.input).toBe(100);
      // The parent's own messageCount is its own conversation only -- the child's count is on its
      // own `children` entry, not rolled into the parent's.
      expect(vm?.messageCount).toBe(1);
      expect(vm?.children[0]?.messageCount).toBe(1);
      expect(vm?.children[0]?.cost).toBe(2);
      expect(vm?.children[0]?.tokens.input).toBe(200);
    });

    test("getViewModel(childId) returns the parent's (root's) ViewModel, not a standalone one for the child", () => {
      handleSessionCreated(makeSessionCreated("s-parent-3"));
      handleSessionCreated(makeSessionCreated("s-child-3", { parentID: "s-parent-3" }));

      expect(getViewModel("s-child-3")?.id).toBe("s-parent-3");
      expect(getViewModel("s-child-3")).toEqual(getViewModel("s-parent-3"));
    });

    test("a child's own errorFlag never escalates the parent's own errorFlag/status", () => {
      handleSessionCreated(makeSessionCreated("s-parent-4"));
      handleSessionCreated(makeSessionCreated("s-child-4", { parentID: "s-parent-4" }));
      handleSessionError({
        type: "session.error",
        properties: { sessionID: "s-child-4", error: { name: "UnknownError", data: { message: "child boom" } } },
      });

      const vm = getViewModel("s-parent-4");
      expect(vm?.errorFlag).toBe(false);
      expect(vm?.children[0]?.errorFlag).toBe(true);
      expect(vm?.children[0]?.errorMessage).toBe("child boom");
    });

    test("orphaned sub-session (parentID references an untracked session) is promoted to its own root", () => {
      handleSessionCreated(makeSessionCreated("s-orphan", { parentID: "s-never-tracked" }));

      const vm = getViewModel("s-orphan");
      expect(vm?.id).toBe("s-orphan");
      expect(vm?.children).toEqual([]);
    });

    test("multi-level chain (grandchild) flattens into the top-most root's children, not nested further", () => {
      handleSessionCreated(makeSessionCreated("s-grandparent"));
      handleSessionCreated(makeSessionCreated("s-parent-5", { parentID: "s-grandparent" }));
      handleSessionCreated(makeSessionCreated("s-grandchild", { parentID: "s-parent-5" }));

      const all = getViewModels();
      expect(all.some((vm) => vm.id === "s-parent-5" || vm.id === "s-grandchild")).toBe(false);
      const grandparent = all.find((vm) => vm.id === "s-grandparent");
      expect(grandparent?.children.map((child) => child.id).sort()).toEqual(["s-grandchild", "s-parent-5"]);
    });

    test("children are sorted by session creation time ascending, same tie-break rules as top-level", () => {
      handleSessionCreated(makeSessionCreated("s-parent-6"));
      handleSessionCreated(
        makeSessionCreated("s-child-later", { parentID: "s-parent-6", time: { created: 200, updated: 200 } }),
      );
      handleSessionCreated(
        makeSessionCreated("s-child-earlier", { parentID: "s-parent-6", time: { created: 100, updated: 100 } }),
      );

      const children = getViewModel("s-parent-6")?.children.map((child) => child.id);
      expect(children).toEqual(["s-child-earlier", "s-child-later"]);
    });
  });

  describe("model/provider breakdown", () => {
    test("messages from the same model/provider are grouped into one ModelUsage entry", () => {
      handleSessionCreated(makeSessionCreated("s-model-same"));
      handleMessageUpdated(makeAssistantMessage("m1", "s-model-same", "msg-1", 0.01, 10));
      handleMessageUpdated(makeAssistantMessage("m2", "s-model-same", "msg-2", 0.02, 20));

      const vm = getViewModel("s-model-same");
      expect(vm?.models).toEqual([
        {
          providerID: "provider-1",
          modelID: "model-1",
          tokens: { input: 30, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
          cost: 0.03,
        },
      ]);
      expect(vm?.ownModels).toEqual(vm?.models);
    });

    test("messages from different models produce separate entries, sorted by cost descending", () => {
      handleSessionCreated(makeSessionCreated("s-model-diff"));
      handleMessageUpdated(
        makeAssistantMessage("m1", "s-model-diff", "msg-1", 0.01, 10, { providerID: "p-a", modelID: "cheap" }),
      );
      handleMessageUpdated(
        makeAssistantMessage("m2", "s-model-diff", "msg-2", 0.5, 100, { providerID: "p-b", modelID: "pricey" }),
      );

      const models = getViewModel("s-model-diff")?.models;
      expect(models?.map((m) => `${m.providerID}/${m.modelID}`)).toEqual(["p-b/pricey", "p-a/cheap"]);
    });

    test("a repeated message.updated for the same messageID replaces its model contribution, no double-count", () => {
      handleSessionCreated(makeSessionCreated("s-model-replace"));
      handleMessageUpdated(makeAssistantMessage("m1", "s-model-replace", "msg-1", 0.01, 10));
      handleMessageUpdated(makeAssistantMessage("m1", "s-model-replace", "msg-1", 0.05, 50));

      const models = getViewModel("s-model-replace")?.models;
      expect(models).toEqual([
        {
          providerID: "provider-1",
          modelID: "model-1",
          tokens: { input: 50, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
          cost: 0.05,
        },
      ]);
    });

    test("parent's models = its own + every child's, merged by providerID/modelID, never double-counted", () => {
      handleSessionCreated(makeSessionCreated("s-model-parent"));
      handleSessionCreated(makeSessionCreated("s-model-child", { parentID: "s-model-parent" }));
      handleMessageUpdated(makeAssistantMessage("m1", "s-model-parent", "msg-parent", 0.01, 10));
      handleMessageUpdated(makeAssistantMessage("m2", "s-model-child", "msg-child", 0.02, 20));

      const vm = getViewModel("s-model-parent");
      // Same model/provider on both own + child: merged into one entry, summed.
      expect(vm?.models).toEqual([
        {
          providerID: "provider-1",
          modelID: "model-1",
          tokens: { input: 30, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
          cost: 0.03,
        },
      ]);
      // ownModels stays the parent's own contribution only.
      expect(vm?.ownModels).toEqual([
        {
          providerID: "provider-1",
          modelID: "model-1",
          tokens: { input: 10, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
          cost: 0.01,
        },
      ]);
      expect(vm?.children[0]?.models).toEqual([
        {
          providerID: "provider-1",
          modelID: "model-1",
          tokens: { input: 20, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
          cost: 0.02,
        },
      ]);
    });
  });
});
