import { afterEach, describe, expect, test } from "bun:test";
import type { ViewModel } from "../core/view-model.js";
import { startServer } from "../server/http.js";
import { broadcast, closeAllConnections, handleEventRequest } from "../server/sse.js";
import { connect, connected, sessions, type EventSourceCtor, type EventSourceLike } from "./store.js";

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

async function waitFor(predicate: () => boolean, timeoutMs = 2000): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) throw new Error("timed out waiting for condition");
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

/**
 * Bun (this test runtime) has no global `EventSource` (unlike a browser), so this stands in for
 * it with a real `fetch` against a real server, reading the exact same `data: <json>\n\n` framing
 * `EventSource` would. This is the *only* thing faked -- `connect()` itself, its hardcoded
 * `/event` URL, and `server/http.ts` + `server/sse.ts` are all real, closing the gap where
 * `/event` could drift between client and server undetected.
 */
function makeEventSourceCtor(base: string): EventSourceCtor {
  return class implements EventSourceLike {
    onopen: ((event: Event) => void) | null = null;
    onerror: ((event: Event) => void) | null = null;
    onmessage: ((event: MessageEvent) => void) | null = null;

    constructor(url: string) {
      void this.run(new URL(url, base));
    }

    private async run(url: URL): Promise<void> {
      try {
        const response = await fetch(url);
        if (!response.ok || !response.body) throw new Error(`unexpected status ${response.status}`);
        this.onopen?.(new Event("open"));

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        for (;;) {
          const { value, done } = await reader.read();
          if (done) return;
          buffer += decoder.decode(value, { stream: true });
          let boundary: number;
          while ((boundary = buffer.indexOf("\n\n")) !== -1) {
            const line = buffer.slice(0, boundary);
            buffer = buffer.slice(boundary + 2);
            if (line.startsWith("data: ")) {
              this.onmessage?.({ data: line.slice("data: ".length) } as MessageEvent);
            }
          }
        }
      } catch {
        this.onerror?.(new Event("error"));
      }
    }
  };
}

describe("dashboard/integration", () => {
  let server: Bun.Server<undefined> | undefined;

  afterEach(async () => {
    closeAllConnections();
    await server?.stop(true);
    server = undefined;
    sessions.value = [];
    connected.value = false;
  });

  test("connect() against a real server: onopen fires, snapshot + broadcast both reach sessions.value", async () => {
    const snapshotSession = makeViewModel("s-existing");
    server = startServer({
      hostname: "127.0.0.1",
      port: 0,
      staticDir: "/does-not-matter-for-this-test",
      onEventRequest: () => handleEventRequest(() => [snapshotSession]),
    });

    connect(makeEventSourceCtor(server.url.toString()));

    await waitFor(() => connected.value === true);
    await waitFor(() => sessions.value.length === 1);
    expect(sessions.value).toEqual([snapshotSession]);

    const updated = makeViewModel("s-new", { status: "busy", cost: 1.25 });
    broadcast(updated);

    await waitFor(() => sessions.value.some((session) => session.id === "s-new"));
    expect(sessions.value).toEqual([snapshotSession, updated]);
  });
});
