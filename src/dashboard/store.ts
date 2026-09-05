import { computed, signal } from "@preact/signals";
import { mergeModelUsage, type ModelUsage, type TokenBreakdown, type ViewModel } from "../core/view-model.js";
import { filterViewModels } from "./model-filter.js";

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

/** Per-model/provider sum of each session's already-authoritative `models` (rolled-up total) --
 * same trivial display-only merge as `aggregateCost`/`aggregateTokens` (AD-2), reusing core's own
 * merge logic rather than re-deriving the grouping-by-key here. */
export const aggregateModels = computed<ModelUsage[]>(() =>
  mergeModelUsage(sessions.value.map((session) => session.models)),
);

/** Model/provider filter for the session grid only -- empty means "All" (CAP: never affects
 * `aggregateCost`/`aggregateTokens`/`aggregateModels` above, which stay wired to raw `sessions`). */
export const selectedModelKeys = signal<Set<string>>(new Set());

/** What the session grid actually renders -- `sessions` re-summed/filtered down to
 * `selectedModelKeys` (`model-filter.ts`'s `filterViewModels`, itself a trivial display-only
 * re-sum of already-reported per-model data, per AD-2). */
export const filteredSessions = computed<ViewModel[]>(() =>
  filterViewModels(sessions.value, selectedModelKeys.value),
);

/** Always replaces with a new `Set` (never mutates in place) so the signal's reference-equality
 * check reliably notifies subscribers. */
export function toggleModelFilter(key: string): void {
  const next = new Set(selectedModelKeys.value);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  selectedModelKeys.value = next;
}

export function clearModelFilter(): void {
  selectedModelKeys.value = new Set();
}

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
