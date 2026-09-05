import { afterEach, describe, expect, test } from "bun:test";
import type { ViewModel } from "../core/view-model.js";
import { broadcast, closeAllConnections, handleEventRequest } from "./sse.js";

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

/** Reads a single `data: <json>\n\n` message and parses its JSON payload. */
async function readMessage(reader: ReadableStreamDefaultReader<Uint8Array>): Promise<unknown> {
  const { value, done } = await reader.read();
  if (done || !value) throw new Error("stream ended before a message was received");
  const line = new TextDecoder().decode(value);
  return JSON.parse(line.slice("data: ".length, line.indexOf("\n\n")));
}

describe("server/sse", () => {
  afterEach(() => {
    closeAllConnections();
  });

  test("new connection: first data: line is the full ViewModel[] snapshot", async () => {
    const snapshot = [makeViewModel("s-1"), makeViewModel("s-2")];
    const response = handleEventRequest(() => snapshot);
    const reader = response.body!.getReader();

    await expect(readMessage(reader)).resolves.toEqual(snapshot);

    await reader.cancel();
  });

  test("new connection: response headers are set for EventSource to parse the stream", () => {
    const response = handleEventRequest(() => []);

    expect(response.headers.get("Content-Type")).toBe("text/event-stream");
    expect(response.headers.get("Cache-Control")).toBe("no-cache");
    expect(response.headers.get("Connection")).toBe("keep-alive");
  });

  test("event for known session: connected client receives a data: line with the updated ViewModel", async () => {
    const response = handleEventRequest(() => []);
    const reader = response.body!.getReader();
    await readMessage(reader); // consume the initial snapshot

    const updated = makeViewModel("s-1", { status: "busy" });
    broadcast(updated);

    await expect(readMessage(reader)).resolves.toEqual(updated);

    await reader.cancel();
  });

  test("two connected clients: one broadcast delivers the identical delta to both", async () => {
    const responseA = handleEventRequest(() => []);
    const responseB = handleEventRequest(() => []);
    const readerA = responseA.body!.getReader();
    const readerB = responseB.body!.getReader();
    await readMessage(readerA);
    await readMessage(readerB);

    const updated = makeViewModel("s-1");
    broadcast(updated);

    await expect(readMessage(readerA)).resolves.toEqual(updated);
    await expect(readMessage(readerB)).resolves.toEqual(updated);

    await readerA.cancel();
    await readerB.cancel();
  });

  test("client disconnects: cancelling the stream removes it from the broadcast set", async () => {
    const stillOpen = handleEventRequest(() => []);
    const openReader = stillOpen.body!.getReader();
    await readMessage(openReader);

    const disconnecting = handleEventRequest(() => []);
    const disconnectingReader = disconnecting.body!.getReader();
    await readMessage(disconnectingReader);
    await disconnectingReader.cancel();

    // Broadcasting after the disconnect must not throw, and the still-open client still gets it.
    const updated = makeViewModel("s-1");
    expect(() => broadcast(updated)).not.toThrow();
    await expect(readMessage(openReader)).resolves.toEqual(updated);

    await openReader.cancel();
  });

  test("closeAllConnections: closes every open connection", async () => {
    const response = handleEventRequest(() => []);
    const reader = response.body!.getReader();
    await readMessage(reader);

    closeAllConnections();

    const { done } = await reader.read();
    expect(done).toBe(true);
  });
});
