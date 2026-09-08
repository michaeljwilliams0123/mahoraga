import type { NextConfig } from "next";
import { resolve } from "node:path";

const pagesExport = process.env.MAHORAGA_PAGES_EXPORT === "1";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "Permissions-Policy", value: "camera=(), geolocation=(), payment=(), usb=()" },
  { key: "X-Frame-Options", value: "DENY" },
  {
    key: "Content-Security-Policy",
    value: "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; font-src 'self' data:; img-src 'self' data: blob:; connect-src 'self' https://ai-gateway.vercel.sh https://relay.mahoraga.app wss://relay.mahoraga.app; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'",
  },
];

const nextConfig: NextConfig = {
  agentRules: false,
  poweredByHeader: false,
  ...(pagesExport
    ? {
        output: "export" as const,
        basePath: "/mahoraga",
        assetPrefix: "/mahoraga",
        trailingSlash: true,
        images: { unoptimized: true },
      }
    : {}),
  turbopack: {
    root: resolve(import.meta.dirname, ".."),
  },
  experimental: {
    // Allow importing pure operator-deck/src/lib/cockpit helpers (Deck-owned).
    externalDir: true,
  },
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
};

export default nextConfig;
