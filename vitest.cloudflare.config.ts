import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    cloudflareTest({
      // Workers AI requires a remote proxy when declared in Wrangler. Repository
      // verification must remain credential-free and deterministic, so local
      // integration tests use the equivalent runtime config without the AI binding.
      // Provider execution itself is covered by the source contract regression;
      // live AI inference remains a separate exact-head canary gate.
      wrangler: { configPath: "./deploy/cloudflare-execution-runtime/wrangler.test.jsonc" },
      miniflare: {
        bindings: {
          BYPASS_SECRET: "test-bypass-secret-that-is-not-production",
          CONTENT_VAULT_KEY: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
          PROVIDER_REFRESH_SECRET: "test-provider-refresh-secret",
          ZERO_CREDIT_PROVIDER_URL: "https://zero-credit.example/",
          ZERO_CREDIT_PROVIDER_TOKEN: "zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz",
          ZERO_CREDIT_ACCOUNT_ID_HASH: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          TARGET_SHA: "7cb8aab1129875f798347afdb2844f963e986a65",
          RAILWAY_ANCHOR_URL: "https://mahoraga-runtime-main-production.up.railway.app/",
        },
      },
    }),
  ],
  test: { include: ["cloudflare-test/**/*.vitest.ts"] },
});
