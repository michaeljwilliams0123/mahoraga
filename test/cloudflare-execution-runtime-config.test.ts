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
