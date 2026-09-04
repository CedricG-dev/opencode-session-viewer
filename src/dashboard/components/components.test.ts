import { afterEach, describe, expect, test } from "bun:test";
import type { VNode } from "preact";
import type { ViewModel } from "../../core/view-model.js";
import { sessions, connected } from "../store.js";
import { SessionRow } from "./SessionRow.js";
import { AggregateTotal } from "./AggregateTotal.js";
import { DisconnectedIndicator } from "./DisconnectedIndicator.js";

function makeViewModel(id: string, overrides: Partial<ViewModel> = {}): ViewModel {
  return {
    id,
    title: `Session ${id}`,
    status: "idle",
    tokens: 0,
    cost: 0,
    messageCount: 0,
    lastActivity: new Date(0).toISOString(),
    errorFlag: false,
    ...overrides,
  };
}

/** Flattens a vnode's text content (no DOM) by walking `props.children` recursively. */
function flattenText(node: unknown): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(flattenText).join("");
  const vnode = node as VNode<{ children?: unknown }>;
  return flattenText(vnode.props?.children);
}

function cells(row: VNode<{ children: VNode[] }>): VNode[] {
  return row.props.children;
}

describe("dashboard/components/SessionRow", () => {
  test("renders one <tr> with a <td> per column, in order", () => {
    const row = SessionRow(
      makeViewModel("s-1", {
        title: "My Session",
        status: "busy",
        messageCount: 4,
        lastActivity: "2026-09-04T00:00:00.000Z",
        tokens: 123,
        cost: 1.5,
      }),
    ) as VNode<{ children: VNode[] }>;

    expect(row.type).toBe("tr");
    const tds = cells(row);
    expect(tds).toHaveLength(7);
    expect(tds.every((td) => td.type === "td")).toBe(true);
    expect(tds.map(flattenText)).toEqual(["My Session", "busy", "4", "2026-09-04T00:00:00.000Z", "123", "1.5000", ""]);
  });

  test("errorFlag true: error <td> shows errorMessage, still 7 cells (same count as errorFlag false)", () => {
    const row = SessionRow(
      makeViewModel("s-1", { errorFlag: true, errorMessage: "boom" }),
    ) as VNode<{ children: VNode[] }>;

    const tds = cells(row);
    expect(tds).toHaveLength(7);
    expect(flattenText(tds[6])).toBe("boom");
  });

  test("errorFlag true with no errorMessage: error <td> is present but empty", () => {
    const row = SessionRow(makeViewModel("s-1", { errorFlag: true })) as VNode<{ children: VNode[] }>;

    expect(cells(row)).toHaveLength(7);
    expect(flattenText(cells(row)[6])).toBe("");
  });

  test("cost is formatted to 4 decimal places", () => {
    const row = SessionRow(makeViewModel("s-1", { cost: 0.1 })) as VNode<{ children: VNode[] }>;
    expect(flattenText(cells(row)[5])).toBe("0.1000");
  });
});

describe("dashboard/components/AggregateTotal", () => {
  afterEach(() => {
    sessions.value = [];
  });

  test("renders the full text of the live-summed total, formatted to 4 decimals", () => {
    sessions.value = [makeViewModel("s-1", { cost: 1.1 }), makeViewModel("s-2", { cost: 2.25 })];

    const vnode = AggregateTotal();

    expect(flattenText(vnode)).toBe("Total cost: $3.3500");
  });

  test("zero sessions: total is $0.0000", () => {
    sessions.value = [];

    expect(flattenText(AggregateTotal())).toBe("Total cost: $0.0000");
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
