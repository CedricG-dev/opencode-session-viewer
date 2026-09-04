import type { ViewModel } from "../core/view-model.js";

type Controller = ReadableStreamDefaultController<Uint8Array>;

/** Module-private set of open SSE connections. Populated on connect, pruned on disconnect. */
const connections = new Set<Controller>();

const encoder = new TextEncoder();

/** Plain `data: <json>\n\n` framing, no `id:`/`retry:`/`event:` fields (Design Notes). */
function frame(payload: unknown): Uint8Array {
  return encoder.encode(`data: ${JSON.stringify(payload)}\n\n`);
}

/**
 * `GET /event`: registers the connection and immediately sends the full current snapshot as the
 * first message (AD-7). Removed from the broadcast set on cancel (client disconnect/abort).
 */
export function handleEventRequest(getViewModels: () => ViewModel[]): Response {
  let self: Controller;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      self = controller;
      connections.add(controller);
      try {
        controller.enqueue(frame(getViewModels()));
      } catch (error) {
        // A failed initial snapshot must never leave a stale entry in the broadcast set.
        connections.delete(controller);
        controller.error(error);
      }
    },
    cancel() {
      connections.delete(self);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

/** Sends the identical payload to every connected client (AD-6), always a full replacement (AD-7). */
export function broadcast(viewModel: ViewModel): void {
  const payload = frame(viewModel);
  for (const controller of connections) {
    try {
      controller.enqueue(payload);
    } catch {
      // Enqueue on a closed controller: drop the stale entry.
      connections.delete(controller);
    }
  }
}

/** Closes every open SSE connection (used by `Hooks.dispose()`). */
export function closeAllConnections(): void {
  for (const controller of connections) {
    try {
      controller.close();
    } catch {
      // already closed
    }
  }
  connections.clear();
}
