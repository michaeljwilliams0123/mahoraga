import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { ROOT } from "../src/config.mjs";

const read = (relative) => readFile(path.join(ROOT, relative), "utf8");

test("release packages and attests the host-neutral relay without embedded credentials", async () => {
  const [release, docs, cli] = await Promise.all([read(".github/workflows/release.yml"), read("docs/DESTINY-CODEX-RELAY.md"), read("src/cli.mjs")]);
  assert.match(release, /mahoraga-relay-\$\{version\}\.zip/);
  assert.match(release, /relay\/core\.mjs/);
  assert.match(release, /relay\/cloudflare-worker\.mjs/);
  assert.match(release, /relay\/wrangler\.toml/);
  assert.match(release, /attest-build-provenance/);
  assert.doesNotMatch(release, /CLOUDFLARE_API_TOKEN|CLOUDFLARE_ACCOUNT_ID|OPENAI_API_KEY/);
  const workerConfig = await read("relay/wrangler.toml");
  for (const value of ["Cloudflare Access", "MAHORAGA_OWNER_IDENTITY", "MAHORAGA_WORKSPACE_ORIGIN", "MAHORAGA_LOCAL_RELAY_TOKEN", "MAHORAGA_RELAY_LOCAL_ACCESS_TOKEN", "RELAY_SESSIONS", "five-minute", "ciphertext", "canary", "rollback", "revoke"]) assert.match(docs, new RegExp(value, "i"));
  assert.match(workerConfig, /class_name = "RelayDurableObject"/);
  assert.match(cli, /createPairingOffer/);
  assert.match(cli, /MAHORAGA_RELAY_LOCAL_ACCESS_TOKEN/);
});

test("private-repository relay deployment keeps legacy workspace trust explicit and removable", async () => {
  const [deploy, docs] = await Promise.all([read("scripts/configure-cloudflare-relay.ps1"), read("docs/DESTINY-CODEX-RELAY.md")]);
  assert.match(deploy, /MAHORAGA_LEGACY_WORKSPACE_ORIGIN/);
  assert.match(deploy, /secret bulk/i);
  assert.match(deploy, /MAHORAGA_LEGACY_WORKSPACE_ORIGIN['"]?\s*=\s*\$null/);
  assert.match(docs, /canonical HTTPS workspace origin/i);
  assert.match(docs, /MAHORAGA_LEGACY_WORKSPACE_ORIGIN/);
  assert.doesNotMatch(docs, /exact canonical GitHub Pages origin allowed to pair remotely/i);
});

test("verification keeps repository gates while dedicated Vercel workspace verification is frozen", async () => {
  const [verify, vercel, packageSource] = await Promise.all([read(".github/workflows/verify.yml"), read("cloud-app/vercel.json"), read("package.json")]);
  assert.match(verify, /npm run verify:conversation-plane/);
  assert.match(verify, /Dedicated Vercel\/workspace verification is intentionally frozen/);
  assert.doesNotMatch(verify, /name:\s*Verify unified Vercel workspace/);
  assert.match(verify, /ubuntu-latest/);
  assert.match(verify, /windows-latest/);
  assert.match(verify, /npm run verify/);

  // A dedicated workspace job may be retained for local static verification only,
  // but it must be observational while external Vercel capacity is unavailable.
  if (/Verify unified Vercel workspace/.test(verify)) {
    assert.match(verify, /workspace:[\s\S]*?continue-on-error:\s*true/);
  }

  assert.match(vercel, /"framework": "nextjs"/);
  assert.match(vercel, /"deploymentEnabled"\s*:\s*false/);
  const scripts = JSON.parse(packageSource).scripts;
  assert.match(scripts["verify:conversation-plane"], /conversation-plane-smoke/);
  assert.match(scripts["verify:conversation-plane"], /relay-deployment-contract/);
});
