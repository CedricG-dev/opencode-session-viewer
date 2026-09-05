import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { ViewModel } from "../core/view-model.js";
import { applyPayload, connect, connected, sessions, aggregateCost, aggregateTokens, type EventSourceLike } from "./store.js";

function makeViewModel(id: string, overrides: Partial<ViewModel> = {}): ViewModel {
  return {
    id,
    title: `Session ${id}`,
    status: "idle",
    tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
    cost: 0,
    ownTokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
    ownCost: 0,
    messageCount: 0,
    lastActivity: new Date(0).toISOString(),
    errorFlag: false,
    children: [],
    ...overrides,
  };
}

class FakeEventSource implements EventSourceLike {
  onopen: ((event: Event) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;

  constructor(public url: string) {}

  emitOpen(): void {
    this.onopen?.(new Event("open"));
  }

  emitError(): void {
    this.onerror?.(new Event("error"));
  }

  emitMessage(data: string): void {
    this.onmessage?.({ data } as MessageEvent);
  }
}

describe("dashboard/store", () => {
  beforeEach(() => {
    sessions.value = [];
    connected.value = false;
  });

  afterEach(() => {
    sessions.value = [];
    connected.value = false;
  });

  describe("connect", () => {
    test("connects to /event, matching server/sse.ts's route", () => {
      const source = connect(FakeEventSource) as unknown as FakeEventSource;
      expect(source.url).toBe("/event");
    });

    test("onopen fires: connected toggles true", () => {
      const source = connect(FakeEventSource) as unknown as FakeEventSource;
      source.emitOpen();
      expect(connected.value).toBe(true);
    });

    test("onerror fires: connected toggles false", () => {
      const source = connect(FakeEventSource) as unknown as FakeEventSource;
      source.emitOpen();
      source.emitError();
      expect(connected.value).toBe(false);
    });

    test("message is a JSON array (snapshot): sessions is fully replaced", () => {
      sessions.value = [makeViewModel("stale")];
      const source = connect(FakeEventSource) as unknown as FakeEventSource;
      const snapshot = [makeViewModel("s-1"), makeViewModel("s-2")];

      source.emitMessage(JSON.stringify(snapshot));

      expect(sessions.value).toEqual(snapshot);
    });

    test("message is a JSON object (delta) for a known id: only that id's entry is replaced", () => {
      sessions.value = [makeViewModel("s-1"), makeViewModel("s-2")];
      const source = connect(FakeEventSource) as unknown as FakeEventSource;
      const updated = makeViewModel("s-1", { status: "busy" });

      source.emitMessage(JSON.stringify(updated));

      expect(sessions.value).toEqual([updated, makeViewModel("s-2")]);
    });

    test("message is a JSON object (delta) for an unknown id: it is appended", () => {
      sessions.value = [makeViewModel("s-1")];
      const source = connect(FakeEventSource) as unknown as FakeEventSource;
      const appended = makeViewModel("s-new");

      source.emitMessage(JSON.stringify(appended));

      expect(sessions.value).toEqual([makeViewModel("s-1"), appended]);
    });

    test("malformed message payload: dropped, sessions left untouched", () => {
      sessions.value = [makeViewModel("s-1")];
      const source = connect(FakeEventSource) as unknown as FakeEventSource;

      expect(() => source.emitMessage("not json")).not.toThrow();
      expect(sessions.value).toEqual([makeViewModel("s-1")]);
    });
  });

  describe("applyPayload", () => {
    test("array payload replaces the whole list", () => {
      sessions.value = [makeViewModel("old")];
      const snapshot = [makeViewModel("s-1")];
      applyPayload(snapshot);
      expect(sessions.value).toBe(snapshot);
    });

    test("object payload for a known id replaces only that entry, others untouched", () => {
      const untouched = makeViewModel("s-2");
      sessions.value = [makeViewModel("s-1"), untouched];
      const updated = makeViewModel("s-1", { cost: 1.5 });

      applyPayload(updated);

      expect(sessions.value[0]).toEqual(updated);
      expect(sessions.value[1]).toBe(untouched);
    });
  });

  describe("aggregateCost", () => {
    test("sums each session's cost", () => {
      sessions.value = [makeViewModel("s-1", { cost: 1.1 }), makeViewModel("s-2", { cost: 2.2 })];
      expect(aggregateCost.value).toBeCloseTo(3.3);
    });

    test("updates live when sessions changes", () => {
      sessions.value = [makeViewModel("s-1", { cost: 1 })];
      expect(aggregateCost.value).toBe(1);
      applyPayload(makeViewModel("s-1", { cost: 5 }));
      expect(aggregateCost.value).toBe(5);
    });
  });

  describe("aggregateTokens", () => {
    test("sums each token category across sessions independently", () => {
      sessions.value = [
        makeViewModel("s-1", { tokens: { input: 10, output: 20, reasoning: 30, cache: { read: 40, write: 50 } } }),
        makeViewModel("s-2", { tokens: { input: 1, output: 2, reasoning: 3, cache: { read: 4, write: 5 } } }),
      ];

      expect(aggregateTokens.value).toEqual({ input: 11, output: 22, reasoning: 33, cache: { read: 44, write: 55 } });
    });

    test("updates live when sessions changes", () => {
      sessions.value = [makeViewModel("s-1", { tokens: { input: 1, output: 0, reasoning: 0, cache: { read: 0, write: 0 } } })];
      expect(aggregateTokens.value.input).toBe(1);
      applyPayload(makeViewModel("s-1", { tokens: { input: 5, output: 0, reasoning: 0, cache: { read: 0, write: 0 } } }));
      expect(aggregateTokens.value.input).toBe(5);
    });
  });
});
