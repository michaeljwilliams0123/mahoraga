const PAGES_ORIGIN = 'https://michaeljwilliams0123.github.io';
export function normalizeWorkspaceOrigin(value: unknown): string | null {
 if (typeof value !== 'string' || !value.trim() || value.length > 2048 || /[\r\n\t]/.test(value)) return null;
 try {
  const url = new URL(value.trim());
  return url.protocol === 'https:' && !url.username && !url.password && url.pathname === '/' && !url.search && !url.hash ? url.origin : null;
 } catch { return null; }
}
/** The new host is explicit; absent configuration keeps the incumbent Pages boundary. */
export function configuredWorkspaceOrigins(env: { MAHORAGA_PAGES_ORIGIN?: unknown; MAHORAGA_WORKSPACE_ORIGIN?: unknown }): readonly string[] | null {
 const pages = normalizeWorkspaceOrigin(env.MAHORAGA_PAGES_ORIGIN ?? PAGES_ORIGIN);
 if (!pages) return null;
 if (env.MAHORAGA_WORKSPACE_ORIGIN === undefined) return Object.freeze([pages]);
 const workspace = normalizeWorkspaceOrigin(env.MAHORAGA_WORKSPACE_ORIGIN);
 return workspace ? Object.freeze([...new Set([pages, workspace])]) : null;
}
