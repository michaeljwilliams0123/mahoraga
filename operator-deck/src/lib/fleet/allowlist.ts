export const ALLOWED_HOSTS = new Set([
  "api.github.com",
  "github.com",
  "www.github.com",
  "raw.githubusercontent.com",
  "docs.github.com",
  "mahoraga-cloud-workspace.vercel.app",
  "en.wikipedia.org",
  "wikipedia.org",
  "developer.mozilla.org",
  "www.npmjs.com",
  "registry.npmjs.org",
  "nodejs.org",
]);

export const DENIED_TUNNEL_TERMS =
  /\b(ngrok|cloudflared|cloudflare\s+tunnel|localtunnel|serveo|trycloudflare|playit\.gg|bore\.pub|tailscale\s+funnel|reverse\s+ssh|inbound\s+tunnel|expose\s+(my\s+)?(device|localhost|loopback|port)|port\s*forward\s+into|open\s+a\s+tunnel\s+into)\b/i;

const PRIVATE_HOST =
  /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.|0\.0\.0\.0|\[::1\]|metadata\.google|169\.254\.)/i;

export function extractHttpsUrls(text: string): string[] {
  const matches = text.match(/https:\/\/[^\s<>"']+/gi) ?? [];
  return matches.map((raw) => raw.replace(/[),.;]+$/g, ""));
}

export function inspectTargetUrl(raw: string): { ok: true; url: URL } | { ok: false; reason: string } {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, reason: "url-unparseable" };
  }
  if (url.protocol !== "https:") return { ok: false, reason: "https-only" };
  if (url.username || url.password) return { ok: false, reason: "credentials-in-url" };
  const host = url.hostname.toLowerCase();
  if (PRIVATE_HOST.test(host)) return { ok: false, reason: "private-network-denied" };
  if (!ALLOWED_HOSTS.has(host)) return { ok: false, reason: `host-not-allowlisted:${host}` };
  return { ok: true, url };
}

export function isDeniedTunnelRequest(text: string): boolean {
  return DENIED_TUNNEL_TERMS.test(text);
}
