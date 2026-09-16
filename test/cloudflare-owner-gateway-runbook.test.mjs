import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const docs = readFileSync(new URL("../docs/CLOUD-ALWAYS-ON-RUNTIME.md", import.meta.url), "utf8");

test("owner gateway runbook is Access-first, pinned, and secret-safe", () => {
  for (const token of [
    "ctx.access", "cloudflare:owner-gateway:whoami", "cloudflare:owner-gateway:secret:owner",
    "cloudflare:owner-gateway:secret:assertion", "cloudflare:owner-gateway:deploy",
    "MAHORAGA_CLOUD_OWNER_ASSERTION_SECRET", "MAHORAGA_CLOUD_OWNER_ID",
  ]) assert.match(docs, new RegExp(token.replaceAll(":", "\\:")));
  assert.match(docs, /same assertion secret/i);
  assert.match(docs, /Access[\s\S]*production `workers\.dev` URL/i);
  assert.match(docs, /without `ctx\.access`[\s\S]*403/i);
  assert.doesNotMatch(docs, /MAHORAGA_CLOUD_OWNER_ASSERTION_SECRET\s*=\s*[A-Za-z0-9_-]{32,}/);
});
