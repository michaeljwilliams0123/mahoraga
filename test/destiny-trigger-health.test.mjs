import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const script = new URL("../scripts/destiny-trigger-health.mjs", import.meta.url);
const repository = "michaeljwilliams0123/mahoraga";

function run(args = []) {
  return spawnSync(process.execPath, [script.pathname, ...args], { encoding: "utf8" });
}

async function tempJson(value) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "mahoraga-destiny-trigger-"));
  const file = path.join(directory, "observation.json");
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  return file;
}

test("preflight is non-ready when external identity is unconfigured", () => {
  const result = run(["--now", "2026-09-03T02:00:00.000Z"]);
  assert.equal(result.status, 1);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.ready, false);
  assert.equal(parsed.reason, "destiny-trigger-identity-unconfigured");
});

test("preflight accepts only fresh zero-credit evidence for the configured dedicated actor", async () => {
  const manifest = {
    schemaVersion: 1,
    triggerId: "destiny-event-dispatch-v1",
    repository,
    owner: "michaeljwilliams0123",
    readinessMaxAgeMs: 300000,
    zeroCreditRequired: true,
    receiptTrust: { mode: "dedicated-actor", actorLogin: "destiny-codex-trigger[bot]" },
  };
  const directory = await mkdtemp(path.join(os.tmpdir(), "mahoraga-destiny-trigger-manifest-"));
  const manifestFile = path.join(directory, "manifest.json");
  await writeFile(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  const observationFile = await tempJson({
    schemaVersion: 1,
    triggerId: manifest.triggerId,
    repository,
    status: "ready",
    observedAt: "2026-09-03T02:00:00.000Z",
    zeroCreditEligible: true,
    actorLogin: "destiny-codex-trigger[bot]",
    installationFingerprint: "installation:test:v1",
  });
  const result = run(["--manifest", manifestFile, "--observation", observationFile, "--now", "2026-09-03T02:03:00.000Z"]);
  assert.equal(result.status, 0);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.ready, true);
  assert.equal(parsed.zeroCreditEligible, true);
  assert.equal(parsed.actorLogin, "destiny-codex-trigger[bot]");
});

test("preflight fails closed on stale or non-zero-credit readiness evidence", async () => {
  const manifest = {
    schemaVersion: 1,
    triggerId: "destiny-event-dispatch-v1",
    repository,
    owner: "michaeljwilliams0123",
    readinessMaxAgeMs: 300000,
    zeroCreditRequired: true,
    receiptTrust: { mode: "dedicated-actor", actorLogin: "destiny-codex-trigger[bot]" },
  };
  const directory = await mkdtemp(path.join(os.tmpdir(), "mahoraga-destiny-trigger-manifest-"));
  const manifestFile = path.join(directory, "manifest.json");
  await writeFile(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  const stale = await tempJson({ schemaVersion: 1, triggerId: manifest.triggerId, repository, status: "ready", observedAt: "2026-09-03T01:00:00.000Z", zeroCreditEligible: true, actorLogin: "destiny-codex-trigger[bot]" });
  const staleResult = run(["--manifest", manifestFile, "--observation", stale, "--now", "2026-09-03T02:03:00.000Z"]);
  assert.equal(staleResult.status, 1);
  assert.equal(JSON.parse(staleResult.stdout).reason, "destiny-trigger-readiness-stale");
  const metered = await tempJson({ schemaVersion: 1, triggerId: manifest.triggerId, repository, status: "ready", observedAt: "2026-09-03T02:00:00.000Z", zeroCreditEligible: false, actorLogin: "destiny-codex-trigger[bot]" });
  const meteredResult = run(["--manifest", manifestFile, "--observation", metered, "--now", "2026-09-03T02:03:00.000Z"]);
  assert.equal(meteredResult.status, 1);
  assert.equal(JSON.parse(meteredResult.stdout).reason, "destiny-trigger-zero-credit-not-eligible");
});

test("preflight rejects malformed local input without attempting external work", async () => {
  const bad = await tempJson({ status: "ready" });
  const result = run(["--observation", bad]);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /destiny-trigger-/);
});
