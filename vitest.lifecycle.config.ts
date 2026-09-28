import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [cloudflareTest({
    wrangler: { configPath: "./deploy/cloudflare-lifecycle-evaluation/wrangler.test.jsonc" },
    miniflare: { bindings: {
      RUN_ID: "abc123def456", TARGET_SHA: "b".repeat(40), ROLE: "clone",
      EXPIRES_AT: "2099-01-01T00:00:00.000Z", LIFECYCLE_CHALLENGE_SECRET: "lifecycle-local-test-secret",
    } },
  })],
  test: { include: ["cloudflare-test/curious-lifecycle-worker.integration.vitest.ts"], fileParallelism: false },
});
