import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./deploy/cloudflare-execution-runtime/wrangler.jsonc" },
      miniflare: {
        bindings: {
          BYPASS_SECRET: "test-bypass-secret-that-is-not-production",
          TARGET_SHA: "7cb8aab1129875f798347afdb2844f963e986a65",
          RAILWAY_ANCHOR_URL: "https://mahoraga-runtime-main-production.up.railway.app/",
        },
      },
    }),
  ],
  test: { include: ["cloudflare-test/**/*.vitest.ts"] },
});
