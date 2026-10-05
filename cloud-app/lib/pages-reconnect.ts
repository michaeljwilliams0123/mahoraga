type RecoverySurface = { window: Pick<EventTarget, 'addEventListener' | 'removeEventListener'>; document: Pick<EventTarget, 'addEventListener' | 'removeEventListener'> & { readonly visibilityState: string } };
/** Retry authentication once per disconnected state; never replay a task or submit credentials. */
export function subscribePagesReconnect(reconnect: () => void, surface: RecoverySurface = { window, document }) {
  let requested = false;
  const retry = () => {
    if (requested || surface.document.visibilityState !== 'visible') return;
    requested = true;
    reconnect();
  };
  surface.window.addEventListener('focus', retry);
  surface.window.addEventListener('online', retry);
  surface.document.addEventListener('visibilitychange', retry);
  return () => {
    surface.window.removeEventListener('focus', retry);
    surface.window.removeEventListener('online', retry);
    surface.document.removeEventListener('visibilitychange', retry);
  };
}
