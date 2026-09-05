import { computed, signal } from "@preact/signals";
import type { TokenBreakdown, ViewModel } from "../core/view-model.js";

/** Client-side read model, hydrated exclusively from the SSE stream -- never derives a new fact
 * beyond `aggregateCost`/`aggregateTokens`'s trivial display-only sums (AD-2). */
export const sessions = signal<ViewModel[]>([]);

/** Toggled only by `connect()`'s `onopen`/`onerror` (AD-7) -- reconnect itself is EventSource's
 * native retry, not reimplemented here. */
export const connected = signal(false);

/** Sum of each session's already-authoritative `cost` -- trivial display-only aggregation, never
 * an independent cost computation (AD-2). */
export const aggregateCost = computed(() => sessions.value.reduce((total, session) => total + session.cost, 0));

/** Per-category sum of each session's already-authoritative `tokens` -- same trivial display-only
 * aggregation as `aggregateCost`, never an independent token computation (AD-2). */
export const aggregateTokens = computed<TokenBreakdown>(() =>
  sessions.value.reduce(
    (total, session) => ({
      input: total.input + session.tokens.input,
      output: total.output + session.tokens.output,
      reasoning: total.reasoning + session.tokens.reasoning,
      cache: {
        read: total.cache.read + session.tokens.cache.read,
        write: total.cache.write + session.tokens.cache.write,
      },
    }),
    { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
  ),
);

/** Snapshot (array) fully replaces the list; delta (single object) replaces that session by `id`,
 * appending when the `id` is unseen (AD-7). */
export function applyPayload(payload: ViewModel[] | ViewModel): void {
  if (Array.isArray(payload)) {
    sessions.value = payload;
    return;
  }
  const index = sessions.value.findIndex((session) => session.id === payload.id);
  sessions.value =
    index === -1
      ? [...sessions.value, payload]
      : sessions.value.map((session, i) => (i === index ? payload : session));
}

/** Minimal subset of the DOM `EventSource` interface `connect()` depends on -- lets tests supply
 * a fake without satisfying the full `EventSource` type. */
export type EventSourceLike = {
  onopen: ((event: Event) => void) | null;
  onerror: ((event: Event) => void) | null;
  onmessage: ((event: MessageEvent) => void) | null;
};

export type EventSourceCtor = new (url: string) => EventSourceLike;

/** DI mirrors `plugin.ts`'s `PluginDeps`. Connects to `GET /event` (`server/sse.ts`'s route). */
export function connect(EventSourceImpl: EventSourceCtor = EventSource): EventSourceLike {
  const source = new EventSourceImpl("/event");
  source.onopen = () => {
    connected.value = true;
  };
  source.onerror = () => {
    connected.value = false;
  };
  source.onmessage = (event) => {
    try {
      applyPayload(JSON.parse(event.data));
    } catch (error) {
      // Malformed payload: logged/dropped, matches plugin.ts's defensive convention.
      console.error("dashboard/store: failed to parse SSE payload", error);
    }
  };
  return source;
}
