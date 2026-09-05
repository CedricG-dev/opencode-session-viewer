import { describe, expect, test } from "vitest";
import type { ModelUsage, SubSessionSummary, ViewModel } from "../core/view-model.js";
import { filterViewModels, modelFilterKey } from "./model-filter.js";

const ZERO_TOKENS = { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } };

function makeModel(providerID: string, modelID: string, cost: number, input = 10): ModelUsage {
  return { providerID, modelID, tokens: { ...ZERO_TOKENS, input }, cost };
}

function makeSub(id: string, overrides: Partial<SubSessionSummary> = {}): SubSessionSummary {
  return {
    id,
    title: `Sub ${id}`,
    status: "idle",
    tokens: ZERO_TOKENS,
    cost: 0,
    models: [],
    messageCount: 0,
    lastActivity: new Date(0).toISOString(),
    errorFlag: false,
    ...overrides,
  };
}

function makeVM(id: string, overrides: Partial<ViewModel> = {}): ViewModel {
  return {
    id,
    title: `Session ${id}`,
    directory: "/tmp/proj",
    status: "idle",
    tokens: ZERO_TOKENS,
    cost: 0,
    models: [],
    ownTokens: ZERO_TOKENS,
    ownCost: 0,
    ownModels: [],
    messageCount: 0,
    lastActivity: new Date(0).toISOString(),
    errorFlag: false,
    children: [],
    ...overrides,
  };
}

describe("modelFilterKey", () => {
  test("joins providerID/modelID into a stable string", () => {
    expect(modelFilterKey({ providerID: "anthropic", modelID: "claude" })).toBe("anthropic::claude");
  });
});

describe("filterViewModels", () => {
  test("empty selection: returns sessions unchanged (\"All\")", () => {
    const sessions = [makeVM("s-1")];
    expect(filterViewModels(sessions, new Set())).toBe(sessions);
  });

  test("session using only the selected model: kept with its full numbers", () => {
    const claude = makeModel("anthropic", "claude", 2, 100);
    const sessions = [makeVM("s-1", { ownModels: [claude], ownTokens: claude.tokens, ownCost: 2, models: [claude], tokens: claude.tokens, cost: 2 })];

    const result = filterViewModels(sessions, new Set(["anthropic::claude"]));

    expect(result).toHaveLength(1);
    expect(result[0]?.ownCost).toBe(2);
    expect(result[0]?.cost).toBe(2);
    expect(result[0]?.ownModels).toEqual([claude]);
  });

  test("session using a different model only: dropped entirely", () => {
    const gpt = makeModel("openai", "gpt", 1);
    const sessions = [makeVM("s-1", { ownModels: [gpt], ownCost: 1, models: [gpt], cost: 1 })];

    expect(filterViewModels(sessions, new Set(["anthropic::claude"]))).toEqual([]);
  });

  test("union semantics: a session using either of two selected models is kept, summed", () => {
    const claude = makeModel("anthropic", "claude", 2);
    const gpt = makeModel("openai", "gpt", 3);
    const sessions = [
      makeVM("s-1", { ownModels: [claude], ownCost: 2, models: [claude], cost: 2 }),
      makeVM("s-2", { ownModels: [gpt], ownCost: 3, models: [gpt], cost: 3 }),
    ];

    const result = filterViewModels(sessions, new Set(["anthropic::claude", "openai::gpt"]));

    expect(result.map((vm) => vm.id)).toEqual(["s-1", "s-2"]);
  });

  test("a session using both a matching and non-matching model: own numbers restricted to the matching one only", () => {
    const claude = makeModel("anthropic", "claude", 2, 100);
    const gpt = makeModel("openai", "gpt", 5, 50);
    const sessions = [
      makeVM("s-1", {
        ownModels: [claude, gpt],
        ownCost: 7,
        ownTokens: { ...ZERO_TOKENS, input: 150 },
        models: [claude, gpt],
        cost: 7,
        tokens: { ...ZERO_TOKENS, input: 150 },
      }),
    ];

    const result = filterViewModels(sessions, new Set(["anthropic::claude"]));

    expect(result[0]?.ownCost).toBe(2);
    expect(result[0]?.ownTokens.input).toBe(100);
    expect(result[0]?.ownModels).toEqual([claude]);
    expect(result[0]?.cost).toBe(2);
  });

  test("root with zero own match but a matching child: root stays, own zeroed, children pruned to matches only", () => {
    const claude = makeModel("anthropic", "claude", 4, 40);
    const gpt = makeModel("openai", "gpt", 1);
    const sessions = [
      makeVM("s-1", {
        ownModels: [gpt],
        ownCost: 1,
        models: [gpt, claude],
        cost: 5,
        children: [
          makeSub("sub-1", { models: [claude], cost: 4, tokens: claude.tokens }),
          makeSub("sub-2", { models: [gpt], cost: 1 }),
        ],
      }),
    ];

    const result = filterViewModels(sessions, new Set(["anthropic::claude"]));

    expect(result).toHaveLength(1);
    const vm = result[0]!;
    expect(vm.ownModels).toEqual([]);
    expect(vm.ownCost).toBe(0);
    expect(vm.children.map((c) => c.id)).toEqual(["sub-1"]);
    expect(vm.cost).toBe(4);
    expect(vm.tokens.input).toBe(40);
    expect(vm.models).toEqual([claude]);
  });

  test("root with neither own nor any child matching: dropped entirely", () => {
    const gpt = makeModel("openai", "gpt", 1);
    const sessions = [
      makeVM("s-1", {
        ownModels: [gpt],
        models: [gpt],
        cost: 1,
        children: [makeSub("sub-1", { models: [gpt], cost: 1 })],
      }),
    ];

    expect(filterViewModels(sessions, new Set(["anthropic::claude"]))).toEqual([]);
  });

  test("own and a child both use the matching model: rolled-up models are merged, not duplicated", () => {
    const claude = makeModel("anthropic", "claude", 2, 20);
    const sessions = [
      makeVM("s-1", {
        ownModels: [claude],
        ownCost: 2,
        ownTokens: claude.tokens,
        models: [claude],
        cost: 2,
        children: [makeSub("sub-1", { models: [claude], cost: 2, tokens: claude.tokens })],
      }),
    ];

    const result = filterViewModels(sessions, new Set(["anthropic::claude"]));
    const vm = result[0]!;

    expect(vm.models).toHaveLength(1);
    expect(vm.models[0]?.cost).toBe(4);
    expect(vm.cost).toBe(4);
    expect(vm.tokens.input).toBe(40);
  });
});
