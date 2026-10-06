export const SSE_HEADERS = {
  "cache-control": "no-store, no-transform",
  "content-type": "text/event-stream; charset=utf-8",
  "x-accel-buffering": "no",
  "x-content-type-options": "nosniff",
};
export const SSE_TICK_MS = 10_000;
export const SSE_MAX_LIFETIME_MS = 5 * 60_000;
export const SSE_RETRY_MS = 3_000;

type Logger = (record: Record<string, unknown>) => void;
export type CapabilityStreamOptions = {
  load: () => Promise<{ capabilities: unknown[] }>;
  /** Optional per-tick hook (lazy admission renewal); failures never end the stream. */
  beforeTick?: () => Promise<unknown>;
  signal?: AbortSignal;
  tickMs?: number;
  maxLifetimeMs?: number;
  now?: () => number;
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
  log?: Logger;
};

const defaultSleep = (ms: number, signal?: AbortSignal) => new Promise<void>((resolve) => {
  if (signal?.aborted) { resolve(); return; }
  const timer = setTimeout(done, ms);
  function done() { clearTimeout(timer); signal?.removeEventListener("abort", done); resolve(); }
  signal?.addEventListener("abort", done, { once: true });
});

/**
 * Owner-authenticated server-sent event stream. Emits `capabilities` on first connect and on change,
 * `heartbeat` otherwise, and a final `reconnect` before the bounded lifetime ends so clients re-attach cleanly.
 * Payloads carry only the already-bounded capability projection, never credentials.
 */
export function capabilityEventStream(options: CapabilityStreamOptions): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const now = options.now ?? Date.now;
  const sleep = options.sleep ?? defaultSleep;
  const log: Logger = options.log ?? ((record) => console.log(JSON.stringify({ component: "mahoraga-owner-gateway", ...record })));
  const tickMs = options.tickMs ?? SSE_TICK_MS;
  const maxLifetimeMs = options.maxLifetimeMs ?? SSE_MAX_LIFETIME_MS;
  const startedAt = now();
  let cancelled = false;
  const stop = new AbortController();
  options.signal?.addEventListener("abort", () => { cancelled = true; stop.abort(); }, { once: true });
  const frame = (event: string, data: unknown) => encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      log({ event: "sse-connect" });
      let last = "";
      let sequence = 0;
      try {
        controller.enqueue(encoder.encode(`retry: ${SSE_RETRY_MS}\n\n`));
        while (!cancelled) {
          try { await options.beforeTick?.(); } catch { /* renewal is best-effort here */ }
          let snapshot: string | null = null;
          let capabilities: unknown[] = [];
          try {
            const value = await options.load();
            capabilities = value.capabilities;
            snapshot = JSON.stringify(capabilities);
          } catch { snapshot = null; }
          if (cancelled) break;
          if (snapshot !== null && snapshot !== last) {
            last = snapshot;
            sequence += 1;
            controller.enqueue(frame("capabilities", { sequence, observedAt: new Date(now()).toISOString(), capabilities }));
          } else {
            controller.enqueue(frame("heartbeat", { observedAt: new Date(now()).toISOString() }));
          }
          if (now() - startedAt >= maxLifetimeMs) { controller.enqueue(frame("reconnect", {})); break; }
          await sleep(tickMs, stop.signal);
        }
      } catch { /* client went away */ }
      finally {
        log({ event: "sse-disconnect", durationMs: now() - startedAt, cancelled });
        try { controller.close(); } catch { /* already closed */ }
      }
    },
    cancel() { cancelled = true; stop.abort(); },
  });
}
