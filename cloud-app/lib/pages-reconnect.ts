type RecoverySurface = {
  window: Pick<EventTarget, 'addEventListener' | 'removeEventListener'>;
  document: Pick<EventTarget, 'addEventListener' | 'removeEventListener'> & { readonly visibilityState: string };
};
type RecoveryTimers = {
  set: (callback: () => void, ms: number) => unknown;
  clear: (timer: unknown) => void;
};

export const AUTO_RECONNECT_DELAY_MS = 5_000;

const realTimers: RecoveryTimers = {
  set: (callback, ms) => setTimeout(callback, ms),
  clear: timer => clearTimeout(timer as ReturnType<typeof setTimeout>),
};

/**
 * Retry authentication once per disconnected render state.
 *
 * Focus/online/visibility changes recover immediately, while a bounded timer also recovers an
 * already-visible tab after the backend heals. The workspace recreates this subscription after
 * each failed attach, producing bounded retries without replaying work or submitting credentials.
 */
export function subscribePagesReconnect(
  reconnect: () => void,
  surface: RecoverySurface = { window, document },
  timers: RecoveryTimers = realTimers,
) {
  let requested = false;
  const retry = () => {
    if (requested || surface.document.visibilityState !== 'visible') return;
    requested = true;
    reconnect();
  };
  const scheduled = timers.set(retry, AUTO_RECONNECT_DELAY_MS);
  surface.window.addEventListener('focus', retry);
  surface.window.addEventListener('online', retry);
  surface.document.addEventListener('visibilitychange', retry);
  return () => {
    timers.clear(scheduled);
    surface.window.removeEventListener('focus', retry);
    surface.window.removeEventListener('online', retry);
    surface.document.removeEventListener('visibilitychange', retry);
  };
}
