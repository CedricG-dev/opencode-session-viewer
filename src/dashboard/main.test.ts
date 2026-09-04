import { afterEach, describe, expect, test } from "bun:test";
import type { VNode } from "preact";
import type { ViewModel } from "../core/view-model.js";
import { sessions } from "./store.js";
import { App } from "./main.js";

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

/** Flattens a vnode's text content (no DOM) by walking `props.children` recursively. Renders
 * function-component vnodes (e.g. `SessionRow`) by invoking them, same as preact would. */
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

/** Renders a function-component vnode (e.g. a `SessionRow` instance in `<tbody>`) the way preact
 * would, so its own `<td>` children can be inspected. */
function renderVNode(node: VNode): VNode<{ children: unknown }> {
  if (typeof node.type === "function") {
    return (node.type as (props: unknown) => VNode<{ children: unknown }>)(node.props);
  }
  return node as VNode<{ children: unknown }>;
}

describe("dashboard/main App", () => {
  afterEach(() => {
    sessions.value = [];
  });

  test("<thead> column order lines up positionally with SessionRow's <td> order", () => {
    sessions.value = [
      makeViewModel("s-1", {
        title: "My Session",
        status: "busy",
        messageCount: 4,
        lastActivity: "2026-09-04T00:00:00.000Z",
        tokens: 1234,
        cost: 1.5,
      }),
    ];

    const app = App();
    const table = findByType(app.props.children, "table");
    const thead = findByType(table.props.children, "thead");
    const headerRow = renderVNode(asArray(thead.props.children)[0] as VNode);
    const labels = asArray(headerRow.props.children).map(flattenText);

    const tbody = findByType(table.props.children, "tbody");
    const dataRow = renderVNode(asArray(tbody.props.children)[0] as VNode);
    const cells = asArray(dataRow.props.children).map(flattenText);

    expect(labels).toEqual(["Title", "Status", "Messages", "Last Activity", "Tokens", "Cost", "Error"]);
    expect(cells).toEqual(["My Session", "busy", "4", "2026-09-04T00:00:00.000Z", "1,234", "1.5000", ""]);
    // ^ tokens formatted via .toLocaleString("en-US") -- pinned locale, see SessionRow.ts.
    // Same length confirms every header has a positionally corresponding data cell.
    expect(cells).toHaveLength(labels.length);
  });

  test("no sessions: an empty-state row spanning all columns renders instead of a blank <tbody>", () => {
    sessions.value = [];

    const app = App();
    const table = findByType(app.props.children, "table");
    const thead = findByType(table.props.children, "thead");
    const headerRow = renderVNode(asArray(thead.props.children)[0] as VNode);
    const columnCount = asArray(headerRow.props.children).length;

    const tbody = findByType(table.props.children, "tbody");
    const emptyRow = asArray(tbody.props.children)[0] as VNode<{ children: unknown }>;

    expect(emptyRow.type).toBe("tr");
    const cell = asArray(emptyRow.props.children)[0] as VNode<{ colspan: string }>;
    expect(cell.type).toBe("td");
    expect(cell.props.colspan).toBe(String(columnCount));
    expect(flattenText(emptyRow)).toBe("No sessions yet");
  });
});
