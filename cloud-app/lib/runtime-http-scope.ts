/** Bounds the complete request, including body decoding. Mutations are never replayed. */
export class RuntimeHttpScope {
 private pending = new Map<AbortController, () => void>();
 run<T>(operation: (signal: AbortSignal) => Promise<T>, timeoutMs: number): Promise<T> {
  const controller = new AbortController();
  return new Promise<T>((resolve, reject) => {
   let settled = false;
   const finish = (value: T | undefined, error?: Error) => {
    if (settled) return;
    settled = true; clearTimeout(timer); this.pending.delete(controller);
    if (error) reject(error); else resolve(value as T);
   };
   const abort = (code: string) => { finish(undefined, new Error(code)); controller.abort(); };
   const timer = setTimeout(() => abort('cloud-request-timeout'), timeoutMs);
   this.pending.set(controller, () => abort('relay-disconnected'));
   try { void operation(controller.signal).then(value => finish(value), () => finish(undefined, new Error('cloud-session-unreachable'))); }
   catch { finish(undefined, new Error('cloud-session-unreachable')); }
  });
 }
 cancel() { for (const cancel of [...this.pending.values()]) cancel(); }
}
