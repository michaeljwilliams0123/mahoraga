import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";

const configPath = fileURLToPath(new URL("../deploy/cloudflare-execution-runtime/wrangler.jsonc", import.meta.url));

test("checked-in Wrangler config carries no deploy provenance", () => {
  const config = readFileSync(configPath, "utf8");
  assert.equal(config.includes("TARGET_SHA"), false);
  assert.equal(config.includes("RAILWAY_ANCHOR_URL"), false);
});

test("execution runtime fails deployment when protected secrets are missing", () => {
  const config = JSON.parse(readFileSync(configPath, "utf8")) as {
    secrets?: { required?: string[] };
  };
  assert.deepEqual(config.secrets?.required, [
    "BYPASS_SECRET",
    "CONTENT_VAULT_KEY",
    "OWNER_GATEWAY_SECRET",
    "PROVIDER_REFRESH_SECRET",
    "ZERO_CREDIT_PROVIDER_URL",
    "ZERO_CREDIT_PROVIDER_TOKEN",
    "ZERO_CREDIT_ACCOUNT_ID_HASH",
    "ZERO_CREDIT_BILLING_ATTESTATION",
  ]);
});
