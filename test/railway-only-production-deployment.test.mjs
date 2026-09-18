import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const rootVercel = new URL("../vercel.json", import.meta.url);
const cloudVercel = new URL("../cloud-app/vercel.json", import.meta.url);
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const readme = read("README.md");

test("Railway-only production keeps Vercel as a silent non-deploying tombstone", () => {
  assert.equal(existsSync(rootVercel), false);
  assert.equal(existsSync(cloudVercel), true);

  const config = JSON.parse(readFileSync(cloudVercel, "utf8"));
  assert.equal(config.git?.deploymentEnabled, false);
  assert.equal(config.github?.silent, true);
  assert.equal(config.framework, undefined);
  assert.equal(config.buildCommand, undefined);
  assert.equal(config.installCommand, undefined);
  assert.equal(config.outputDirectory, undefined);
  assert.match(readme, /Vercel:\*\* historical\/retired from the active production-completion path/);
});

test("active runtime and operator references use the canonical Railway origin", () => {
  const references = {
    versions: read("operator-deck/src/lib/fleet/versions.ts"),
    allowlist: read("operator-deck/src/lib/fleet/allowlist.ts"),
    execute: read("operator-deck/src/lib/fleet/execute.server.ts"),
    browserWorker: read("src/browser-worker.mjs"),
    manifest: read("mahoraga.manifest.json"),
  };
  assert.match(references.versions, /CLOUD_APP_URL = "https:\/\/mahoraga-runtime-main-production\.up\.railway\.app\/"/);
  assert.match(references.allowlist, /"mahoraga-runtime-main-production\.up\.railway\.app"/);
  assert.match(references.execute, /Conversation UI", value: "Railway cloud-app"/);
  assert.match(references.browserWorker, /canonical Railway workspace/);
  assert.match(references.manifest, /canonical Railway workspace/);
  for (const [path, source] of Object.entries(references)) {
    assert.doesNotMatch(source, /mahoraga-cloud-workspace\.vercel\.app|unified Vercel workspace/, path);
  }
});
