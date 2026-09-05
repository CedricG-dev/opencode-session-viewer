import { afterEach, describe, expect, test } from "vitest";
import type { VNode } from "preact";
import type { ModelUsage, SubSessionSummary, ViewModel } from "../../core/view-model.js";
import { sessions, connected, selectedModelKeys } from "../store.js";
import { fmtDate } from "../format.js";
import { SessionCard } from "./SessionCard.js";
import { AggregateTotal } from "./AggregateTotal.js";
import { DisconnectedIndicator } from "./DisconnectedIndicator.js";
import { ModelUsageList } from "./ModelUsageList.js";
import { ModelFilterBar } from "./ModelFilterBar.js";

function makeModelUsage(overrides: Partial<ModelUsage> = {}): ModelUsage {
  return {
    providerID: "anthropic",
    modelID: "claude",
    tokens: { input: 10, output: 20, reasoning: 30, cache: { read: 40, write: 50 } },
    cost: 1.25,
    ...overrides,
  };
}

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
 * function-component vnodes (e.g. `SubSessionItem`) by invoking them, same as preact would. */
function flattenText(node: unknown): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(flattenText).join("");
  const vnode = node as VNode<{ children?: unknown }>;
  if (typeof vnode.type === "function") return flattenText((vnode.type as (props: unknown) => unknown)(vnode.props));
  return flattenText(vnode.props?.children);
}

function fields(card: VNode<{ children: VNode[] }>): VNode[] {
  return card.props.children;
}

/** Renders a function-component vnode (e.g. a `SubSessionItem` instance) the way preact would, so
 * its own rendered element (`<li>`) can be inspected directly. */
function renderVNode(node: VNode): VNode<{ children: unknown }> {
  if (typeof node.type === "function") {
    return (node.type as (props: unknown) => VNode<{ children: unknown }>)(node.props);
  }
  return node as VNode<{ children: unknown }>;
}

function makeSubSession(id: string, overrides: Partial<SubSessionSummary> = {}): SubSessionSummary {
  return {
    id,
    title: `Sub ${id}`,
    status: "idle",
    tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
    cost: 0,
    models: [],
    messageCount: 0,
    lastActivity: new Date(0).toISOString(),
    errorFlag: false,
    ...overrides,
  };
}

describe("dashboard/components/SessionCard", () => {
  test("Total Tokens/Total Cost lead the card (before Messages/Last Activity), Own Usage follows", () => {
    const card = SessionCard(
      makeViewModel("s-1", {
        title: "My Session",
        status: "busy",
        messageCount: 4,
        lastActivity: "2026-09-04T00:00:00.000Z",
        tokens: { input: 500, output: 400, reasoning: 100, cache: { read: 214, write: 20 } },
        cost: 1.5,
        ownTokens: { input: 50, output: 40, reasoning: 10, cache: { read: 21, write: 2 } },
        ownCost: 0.5,
      }),
    ) as VNode<{ children: VNode[] }>;

    expect(card.type).toBe("div");
    const [title, status, totals, meta, ownUsage, subsessions, error] = fields(card);

    expect((title as VNode).type).toBe("h3");
    // Title text is followed inline by the session's id (muted, "close to its name").
    expect(flattenText(title)).toBe("My Session s-1");
    expect(flattenText(status)).toBe("busy");
    // Rolled-up totals (own + every sub-session's) lead the card, on a single line.
    expect(flattenText(totals)).toBe("Total Tokens: 1 234 Total Cost: $1,5000");
    // Messages/Last Activity share a single line.
    expect(flattenText(meta)).toBe(`Messages: 4 · Last Activity: ${fmtDate("2026-09-04T00:00:00.000Z")}`);

    // "Own Usage" shows this session's own contribution only, never the rolled-up total. Its
    // fields sit in an explicit inner <div> (not directly under <details>) so the flex row still
    // works once Chrome's `::details-content` wraps everything after <summary> in an anonymous box.
    const [ownSummary, ownFields] = (ownUsage as VNode<{ children: VNode[] }>).props.children as [
      VNode,
      VNode<{ children: VNode[] }>,
    ];
    expect(flattenText(ownSummary)).toBe("Own Usage");
    expect(ownFields.props.children.map(flattenText)).toEqual([
      "Input: 50",
      "Output: 40",
      "Reasoning: 10",
      "Cache R/W: 21/2",
      "Cost: $0,5000",
    ]);

    // no children: the sub-sessions slot is `null`, not an empty panel.
    expect(subsessions).toBeNull();
    // errorFlag false: the error slot is `null`, not an empty element (unlike the old table layout,
    // a card has no fixed field count to preserve).
    expect(error).toBeNull();
  });

  test("Total Tokens/Total Cost/Own Usage Cost values render inside their respective badges", () => {
    const card = SessionCard(makeViewModel("s-1")) as VNode<{ children: VNode[] }>;
    const [, , totals, , ownUsage] = fields(card) as VNode<{ children: VNode[] }>[];

    // Total Tokens/Total Cost share one line: [text, tokensBadge, text, costBadge].
    const tokensBadge = totals.props.children[1] as VNode<{ class: string }>;
    expect(tokensBadge.props.class).toBe("value-badge value-badge--tokens");

    const costBadge = totals.props.children[3] as VNode<{ class: string }>;
    expect(costBadge.props.class).toBe("value-badge value-badge--cost");

    // Own Usage's fields sit in [summary, div]; the div's children end with the Cost field.
    const ownFields = ownUsage.props.children[1] as VNode<{ children: VNode[] }>;
    const ownCostField = ownFields.props.children.at(-1) as VNode<{ children: VNode[] }>;
    const ownCostBadge = ownCostField.props.children[1] as VNode<{ class: string }>;
    expect(ownCostBadge.props.class).toBe("value-badge value-badge--cost");
  });

  test("children present: renders a sub-session list item per child, with its own status/messages/token breakdown/cost", () => {
    const card = SessionCard(
      makeViewModel("s-1", {
        children: [
          makeSubSession("sub-1", {
            title: "Explore repo (@explore subagent)",
            status: "busy",
            messageCount: 3,
            tokens: { input: 100, output: 50, reasoning: 0, cache: { read: 0, write: 0 } },
            cost: 0.25,
          }),
        ],
      }),
    ) as VNode<{ children: VNode[] }>;

    const panel = fields(card)[5] as VNode<{ children: VNode[] }>;
    expect(panel.type).toBe("div");
    const [label, list] = panel.props.children as unknown as [VNode, VNode<{ children: VNode[] }>];
    expect(flattenText(label)).toBe("Sub-sessions (1)");

    expect(list.type).toBe("ul");
    const items = list.props.children as unknown as VNode[];
    expect(items).toHaveLength(1);
    expect(renderVNode(items[0]!).type).toBe("li");
    expect(flattenText(items[0])).toBe(
      "↳busyExplore repo (@explore subagent)Messages: 3Input: 100Output: 50Reasoning: 0Cache R/W: 0/0Cost: $0,2500",
    );

    // item's children end with [..., Cost field, error slot (null, no error here)].
    const item = renderVNode(items[0]!) as VNode<{ children: VNode[] }>;
    const costField = item.props.children.at(-2) as VNode<{ children: VNode[] }>;
    const costBadge = costField.props.children[1] as VNode<{ class: string }>;
    expect(costBadge.props.class).toBe("value-badge value-badge--cost");
  });

  test("a sub-session's own errorFlag shows inline without changing the parent card's own accent", () => {
    const card = SessionCard(
      makeViewModel("s-1", {
        errorFlag: false,
        children: [makeSubSession("sub-1", { errorFlag: true, errorMessage: "sub boom" })],
      }),
    ) as VNode<{ children: VNode[] }>;

    // Parent's own accent is unaffected: its card class stays status-based, not "--error".
    expect((card.props as { class?: string }).class).toContain("session-card--idle");

    const panel = fields(card)[5] as VNode<{ children: VNode[] }>;
    const [, list] = panel.props.children as unknown as [VNode, VNode<{ children: VNode[] }>];
    const items = list.props.children as unknown as VNode[];
    expect(flattenText(items[0])).toContain("sub boom");
  });

  test("no children: the sub-sessions slot is absent entirely (no empty panel)", () => {
    const card = SessionCard(makeViewModel("s-1", { children: [] })) as VNode<{ children: VNode[] }>;
    expect(fields(card)[5]).toBeNull();
  });

  test("errorFlag true: renders an error line with errorMessage", () => {
    const card = SessionCard(
      makeViewModel("s-1", { errorFlag: true, errorMessage: "boom" }),
    ) as VNode<{ children: VNode[] }>;

    const error = fields(card).at(-1);
    expect((error as VNode).type).toBe("p");
    expect(flattenText(error)).toBe("boom");
  });

  test("errorFlag true with no errorMessage: error line is present but empty", () => {
    const card = SessionCard(makeViewModel("s-1", { errorFlag: true })) as VNode<{ children: VNode[] }>;

    const error = fields(card).at(-1);
    expect((error as VNode).type).toBe("p");
    expect(flattenText(error)).toBe("");
  });

  test("Total Cost and Own Usage's Cost are each formatted to 4 decimal places, independently", () => {
    const card = SessionCard(
      makeViewModel("s-1", { cost: 0.1, ownCost: 0.2 }),
    ) as VNode<{ children: VNode[] }>;

    expect(flattenText(fields(card)[2])).toContain("Total Cost: $0,1000");
    const ownUsage = fields(card)[4] as VNode<{ children: VNode[] }>;
    const ownFields = (ownUsage.props.children[1] as VNode<{ children: VNode[] }>).props.children;
    expect(flattenText(ownFields.at(-1))).toBe("Cost: $0,2000");
  });
});

describe("dashboard/components/AggregateTotal", () => {
  afterEach(() => {
    sessions.value = [];
  });

  test("renders a full-width card with the live-summed cost and full token breakdown", () => {
    sessions.value = [
      makeViewModel("s-1", { cost: 1.1, tokens: { input: 10, output: 20, reasoning: 30, cache: { read: 40, write: 50 } } }),
      makeViewModel("s-2", { cost: 2.25, tokens: { input: 1, output: 2, reasoning: 3, cache: { read: 4, write: 5 } } }),
    ];

    const card = AggregateTotal() as VNode<{ children: VNode[] }>;

    expect(card.type).toBe("div");
    expect((card.props as { class?: string }).class).toBe("aggregate-card");
    const [title, cost, tokens] = card.props.children as [VNode, VNode<{ children: VNode[] }>, VNode];

    expect(flattenText(title)).toBe("Total");
    expect(flattenText(cost)).toBe("Cost: $3,3500");
    const costBadge = cost.props.children[1] as VNode<{ class: string }>;
    expect(costBadge.props.class).toBe("value-badge value-badge--cost");

    const tokenFields = (tokens as VNode<{ children: VNode[] }>).props.children;
    expect(tokenFields.map(flattenText)).toEqual([
      "Input: 11",
      "Output: 22",
      "Reasoning: 33",
      "Cache R/W: 44/55",
      "Total Tokens: 165",
    ]);
    const totalTokensField = tokenFields.at(-1) as VNode<{ children: VNode[] }>;
    const tokensBadge = totalTokensField.props.children[1] as VNode<{ class: string }>;
    expect(tokensBadge.props.class).toBe("value-badge value-badge--tokens");
  });

  test("with one model across sessions: merges into a single compact name-only line, not a numbers panel", () => {
    sessions.value = [
      makeViewModel("s-1", { models: [makeModelUsage({ providerID: "anthropic", modelID: "claude", cost: 1 })] }),
      makeViewModel("s-2", { models: [makeModelUsage({ providerID: "anthropic", modelID: "claude", cost: 2 })] }),
    ];

    const card = AggregateTotal() as VNode<{ children: VNode[] }>;
    const modelUsage = card.props.children[3] as VNode;

    expect(flattenText(modelUsage)).toBe("Model: anthropic / claude");
  });

  test("with 2+ distinct models across sessions: renders a collapsed \"By Model\" section with each one's merged cost", () => {
    sessions.value = [
      makeViewModel("s-1", { models: [makeModelUsage({ providerID: "anthropic", modelID: "claude", cost: 1 })] }),
      makeViewModel("s-2", { models: [makeModelUsage({ providerID: "openai", modelID: "gpt", cost: 2 })] }),
    ];

    const card = AggregateTotal() as VNode<{ children: VNode[] }>;
    const modelUsage = card.props.children[3] as VNode;

    expect(flattenText(modelUsage)).toContain("By Model (2)");
    expect(flattenText(modelUsage)).toContain("anthropic");
    expect(flattenText(modelUsage)).toContain("Cost: $2,0000");
  });

  test("zero sessions: cost and every token category are 0", () => {
    sessions.value = [];

    const card = AggregateTotal() as VNode<{ children: VNode[] }>;
    const [, cost, tokens] = card.props.children;

    expect(flattenText(cost)).toBe("Cost: $0,0000");
    const tokenFields = (tokens as VNode<{ children: VNode[] }>).props.children;
    expect(tokenFields.map(flattenText)).toEqual([
      "Input: 0",
      "Output: 0",
      "Reasoning: 0",
      "Cache R/W: 0/0",
      "Total Tokens: 0",
    ]);
    expect(renderVNode(card.props.children[3] as VNode)).toBeNull();
  });
});

describe("dashboard/components/ModelUsageList", () => {
  test("empty models: renders nothing", () => {
    expect(ModelUsageList({ models: [], label: "By Model" })).toBeNull();
  });

  test("exactly one model: a compact name-only line, no token/cost numbers repeated", () => {
    const vnode = ModelUsageList({
      models: [makeModelUsage({ providerID: "anthropic", modelID: "claude" })],
      label: "By Model",
    });

    expect(flattenText(vnode)).toBe("Model: anthropic / claude");
  });

  test("2+ models: a collapsed details section, one row per model with its own token breakdown and cost badge", () => {
    const vnode = ModelUsageList({
      models: [
        makeModelUsage({ providerID: "anthropic", modelID: "claude", cost: 1.5 }),
        makeModelUsage({ providerID: "openai", modelID: "gpt", cost: 0.5 }),
      ],
      label: "By Model",
    }) as VNode<{ children: VNode[] }>;

    expect(vnode.type).toBe("details");
    expect((vnode.props as { open?: boolean }).open).toBeFalsy();
    expect(flattenText(vnode.props.children[0])).toBe("By Model (2)");
    const list = vnode.props.children[1] as VNode<{ children: VNode[] }>;
    expect(list.type).toBe("ul");
    const rows = list.props.children as unknown as VNode[];
    expect(rows).toHaveLength(2);
    expect(flattenText(rows[0])).toBe("anthropic / claudeInput: 10Output: 20Reasoning: 30Cache R/W: 40/50Cost: $1,5000");

    const costField = (rows[0] as VNode<{ children: VNode[] }>).props.children.at(-1) as VNode<{ children: VNode[] }>;
    const costBadge = costField.props.children[1] as VNode<{ class: string }>;
    expect(costBadge.props.class).toBe("value-badge value-badge--cost");
  });
});

describe("dashboard/components/ModelFilterBar", () => {
  afterEach(() => {
    sessions.value = [];
    selectedModelKeys.value = new Set();
  });

  test("no models seen yet: renders nothing", () => {
    sessions.value = [];
    expect(ModelFilterBar()).toBeNull();
  });

  test("renders an \"All\" chip plus one chip per known model, \"All\" active by default", () => {
    sessions.value = [
      makeViewModel("s-1", { models: [makeModelUsage({ providerID: "anthropic", modelID: "claude", cost: 2 })] }),
      makeViewModel("s-2", { models: [makeModelUsage({ providerID: "openai", modelID: "gpt", cost: 1 })] }),
    ];

    const bar = ModelFilterBar() as VNode<{ children: VNode[] }>;
    const chips = (bar.props.children as unknown as VNode[]).flat() as VNode<{
      class: string;
      "aria-pressed": boolean;
    }>[];

    expect(chips).toHaveLength(3);
    expect(flattenText(chips[0])).toBe("All");
    expect(chips[0]?.props.class).toContain("model-filter-chip--active");
    expect(chips[0]?.props["aria-pressed"]).toBe(true);

    expect(flattenText(chips[1])).toBe("anthropic / claude");
    expect(chips[1]?.props.class).not.toContain("model-filter-chip--active");
  });

  test("clicking a model chip toggles it into the filter and deactivates \"All\"", () => {
    sessions.value = [makeViewModel("s-1", { models: [makeModelUsage({ providerID: "anthropic", modelID: "claude" })] })];

    type Chip = VNode<{ class: string; onClick: () => void }>;
    let chips = ((ModelFilterBar() as VNode<{ children: VNode[] }>).props.children as unknown as VNode[]).flat() as Chip[];
    chips[1]?.props.onClick();

    chips = ((ModelFilterBar() as VNode<{ children: VNode[] }>).props.children as unknown as VNode[]).flat() as Chip[];
    expect(chips[0]?.props.class).not.toContain("model-filter-chip--active");
    expect(chips[1]?.props.class).toContain("model-filter-chip--active");
  });

  test("clicking \"All\" clears the filter", () => {
    sessions.value = [makeViewModel("s-1", { models: [makeModelUsage({ providerID: "anthropic", modelID: "claude" })] })];
    selectedModelKeys.value = new Set(["anthropic::claude"]);

    const bar = ModelFilterBar() as VNode<{ children: VNode[] }>;
    const chips = (bar.props.children as unknown as VNode[]).flat() as VNode<{ onClick: () => void }>[];
    chips[0]?.props.onClick();

    expect(selectedModelKeys.value.size).toBe(0);
  });
});

describe("dashboard/components/DisconnectedIndicator", () => {
  afterEach(() => {
    connected.value = false;
  });

  test("connected: renders nothing", () => {
    connected.value = true;
    expect(DisconnectedIndicator()).toBeNull();
  });

  test("disconnected: renders a visible indicator", () => {
    connected.value = false;
    const vnode = DisconnectedIndicator();
    expect(vnode).not.toBeNull();
    expect(flattenText(vnode)).toBe("Disconnected");
  });
});
