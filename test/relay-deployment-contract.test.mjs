import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { ROOT } from "../src/config.mjs";

const read = (relative) => readFile(path.join(ROOT, relative), "utf8");

test("release packages and attests the host-neutral relay without embedded credentials", async () => {
  const [release, docs] = await Promise.all([read(".github/workflows/release.yml"), read("docs/DESTINY-CODEX-RELAY.md")]);
  assert.match(release, /mahoraga-relay-\$\{version\}\.zip/);
  assert.match(release, /relay\/core\.mjs/);
  assert.match(release, /relay\/cloudflare-worker\.mjs/);
  assert.match(release, /relay\/wrangler\.toml/);
  assert.match(release, /attest-build-provenance/);
  assert.doesNotMatch(release, /CLOUDFLARE_API_TOKEN|CLOUDFLARE_ACCOUNT_ID|OPENAI_API_KEY/);
  const workerConfig = await read("relay/wrangler.toml");
  for (const value of ["Cloudflare Access", "MAHORAGA_OWNER_IDENTITY", "MAHORAGA_PAGES_ORIGIN", "RELAY_SESSIONS", "five-minute", "ciphertext", "canary", "rollback", "revoke"]) assert.match(docs, new RegExp(value, "i"));
  assert.match(workerConfig, /class_name = "RelayDurableObject"/);
});

test("verification and Pages bind focused contracts to exact checked-out source", async () => {
  const [verify, pages, packageSource] = await Promise.all([read(".github/workflows/verify.yml"), read(".github/workflows/pages.yml"), read("package.json")]);
  assert.match(verify, /npm run verify:conversation-plane/);
  assert.match(pages, /git rev-parse HEAD/);
  assert.match(pages, /github\.sha/);
  assert.match(pages, /path: cloud/);
  const scripts = JSON.parse(packageSource).scripts;
  assert.match(scripts["verify:conversation-plane"], /conversation-plane-smoke/);
  assert.match(scripts["verify:conversation-plane"], /relay-deployment-contract/);
});
