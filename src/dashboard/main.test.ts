import { afterEach, describe, expect, test } from "vitest";
import type { VNode } from "preact";
import type { ViewModel } from "../core/view-model.js";
import { sessions, selectedModelKeys } from "./store.js";
import { App } from "./main.js";

function makeViewModel(id: string, overrides: Partial<ViewModel> = {}): ViewModel {
  return {
    id,
    title: `Session ${id}`,
    status: "idle",
    tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
    cost: 0,
    models: [],
    ownTokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
    ownCost: 0,
    ownModels: [],
    messageCount: 0,
    lastActivity: new Date(0).toISOString(),
    errorFlag: false,
    children: [],
    ...overrides,
  };
}

/** Flattens a vnode's text content (no DOM) by walking `props.children` recursively. Renders
 * function-component vnodes (e.g. `SessionCard`) by invoking them, same as preact would. */
function flattenText(node: unknown): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(flattenText).join("");
  const vnode = node as VNode<{ children?: unknown }>;
  if (typeof vnode.type === "function") return flattenText((vnode.type as (props: unknown) => unknown)(vnode.props));
  return flattenText(vnode.props?.children);
}

function asArray<T>(value: T | T[]): T[] {
  return Array.isArray(value) ? value : [value];
}

function findByType(children: unknown, type: string): VNode<{ children: unknown }> {
  const match = asArray(children as VNode[]).find((child) => child?.type === type);
  if (!match) throw new Error(`no vnode of type "${type}" found`);
  return match as VNode<{ children: unknown }>;
}

describe("dashboard/main App", () => {
  afterEach(() => {
    sessions.value = [];
    selectedModelKeys.value = new Set();
  });

  test("renders one SessionCard per session inside .session-grid, in the given order", () => {
    sessions.value = [
      makeViewModel("s-1", { title: "First" }),
      makeViewModel("s-2", { title: "Second" }),
    ];

    const app = App();
    const grid = findByType(app.props.children, "div");
    expect((grid.props as { class?: string }).class).toBe("session-grid");

    const cards = asArray(grid.props.children as VNode[]);
    expect(cards).toHaveLength(2);
    expect(cards.map(flattenText)[0]).toContain("First");
    expect(cards.map(flattenText)[1]).toContain("Second");
  });

  test("model filter active: only sessions matching a selected model render in .session-grid", () => {
    sessions.value = [
      makeViewModel("s-1", {
        title: "First",
        ownModels: [{ providerID: "anthropic", modelID: "claude", tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } }, cost: 1 }],
        models: [{ providerID: "anthropic", modelID: "claude", tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } }, cost: 1 }],
      }),
      makeViewModel("s-2", {
        title: "Second",
        ownModels: [{ providerID: "openai", modelID: "gpt", tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } }, cost: 1 }],
        models: [{ providerID: "openai", modelID: "gpt", tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } }, cost: 1 }],
      }),
    ];
    selectedModelKeys.value = new Set(["anthropic::claude"]);

    const app = App();
    const grid = findByType(app.props.children, "div");
    const cards = asArray(grid.props.children as VNode[]);

    expect(cards).toHaveLength(1);
    expect(flattenText(cards[0])).toContain("First");
  });

  test("no sessions: an empty-state message renders inside .session-grid instead of a blank grid", () => {
    sessions.value = [];

    const app = App();
    const grid = findByType(app.props.children, "div");
    const empty = grid.props.children as VNode<{ class: string }>;

    expect(empty.type).toBe("p");
    expect(empty.props.class).toBe("session-grid__empty");
    expect(flattenText(empty)).toBe("No sessions yet");
  });
});
