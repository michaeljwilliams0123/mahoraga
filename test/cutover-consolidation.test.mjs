import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { hasTrustedRequestOrigin } from "../cloud-app/lib/owner-login.ts";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const read = (relative) => readFileSync(join(ROOT, relative), "utf8");

const RETIRED_RAILWAY_EXECUTABLES = [
  ".github/workflows/railway-promote.yml",
  "scripts/railway-exact-sha-promotion.mjs",
  "state/release-baseline/.github/workflows/railway-promote.yml",
  "state/release-baseline/scripts/railway-exact-sha-promotion.mjs",
];

test("Railway cannot be promoted or reconstructed from active source", () => {
  for (const relative of RETIRED_RAILWAY_EXECUTABLES) {
    assert.equal(existsSync(join(ROOT, relative)), false, `${relative} must be retired`);
  }
  const repair = read("src/repair.mjs");
  assert.doesNotMatch(repair, /railway-promote\.yml|railway-exact-sha-promotion\.mjs/i);
});

test("owner login never trusts RAILWAY_PUBLIC_DOMAIN as an origin grant", () => {
  const railway = "mahoraga-runtime-main-production.up.railway.app";
  const request = new Request("http://0.0.0.0:3000/api/runtime/login", {
    headers: { origin: `https://${railway}` },
  });
  assert.equal(hasTrustedRequestOrigin(request, { RAILWAY_PUBLIC_DOMAIN: railway }), false);
});

test("operator and cockpit surfaces describe Railway as retired non-routing evidence", () => {
  const allowlist = read("operator-deck/src/lib/fleet/allowlist.ts");
  const cockpit = read("cloud-app/components/cockpit/CommandCockpit.tsx");
  assert.doesNotMatch(allowlist, /mahoraga-runtime-main-production\.up\.railway\.app/i);
  assert.match(cockpit, /RAILWAY_RETIRED/);
  assert.match(cockpit, /non-routing rollback\/evidence/i);
  assert.doesNotMatch(cockpit, /RAILWAY_PROMOTE_#656|canonical Railway upstream|Railway exact-SHA promotion/i);
});

test("brain stack remains Node-owned and Cloudflare does not fake the cognitive loop", () => {
  const manifest = read("mahoraga.manifest.json");
  const workerProcess = read("src/worker-process.mjs");
  const cognitiveWorker = read("src/cognitive-worker.mjs");
  const cognitiveLoop = read("src/cognitive-loop.mjs");
  const individual = read("src/cognitive-individual.mjs");
  const evolution = read("src/evolution-controller.mjs");
  const cloudflareRuntime = read("deploy/cloudflare-execution-runtime/worker.ts");

  assert.match(manifest, /"id": "cognitive-core"/);
  for (const capability of ["cognitive.assess", "cognitive.deliberate", "cognitive.predict", "cognitive.transfer", "cognitive.cycle", "cognitive.learn"]) {
    assert.match(manifest, new RegExp(`"${capability.replace(".", "\\.")}"`));
  }
  assert.match(workerProcess, /capability\.startsWith\("cognitive\."\).*executeCognitiveCapability/s);
  assert.match(cognitiveWorker, /runCognitiveLoop/);
  assert.match(cognitiveWorker, /promoteVerifiedCognitiveLearning/);
  assert.match(cognitiveLoop, /resolveCollectiveDissent/);
  assert.match(cognitiveLoop, /assessCollectiveMetacognition/);
  assert.match(cognitiveLoop, /simulateCounterfactual/);
  assert.match(cognitiveLoop, /planWorldStateActions/);
  assert.match(individual, /explicit-promotion-only/);
  assert.match(individual, /external-capability-fabric/);
  assert.match(individual, /projectPublicCognitiveProfile/);
  assert.match(evolution, /candidate-created/);
  assert.match(evolution, /canary-passed/);
  assert.match(evolution, /rollback/);
  assert.doesNotMatch(cloudflareRuntime, /runCognitiveLoop|executeCognitiveCapability|cognitive\.cycle|cognitive\.learn/);
});
