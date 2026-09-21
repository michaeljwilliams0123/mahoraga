import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./deploy/cloudflare-execution-runtime/wrangler.jsonc" },
      miniflare: { bindings: { BYPASS_SECRET: "test-bypass-secret-that-is-not-production" } },
    }),
  ],
  test: { include: ["cloudflare-test/**/*.vitest.ts"] },
});
