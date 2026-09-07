import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  evaluateDestinyTriggerReadiness,
  validateDestinyTriggerTrustManifest,
} from "../src/destiny-trigger-trust.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SCRIPT = path.join(ROOT, "scripts", "bootstrap-destiny-codex.mjs");
const probeId = "destiny-bind-pr181-20260907-a1b2c3d4";
const rawAccountId = "account-destiny-integration-test";
const rawInstallationId = "installation-destiny-integration-test";
const rawEnvironmentId = "michaeljwilliams0123/mahoraga";

test("Destiny bootstrap binds the account-side GitHub probe and emits signed readiness without raw identity", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "mahoraga-destiny-bootstrap-"));
  try {
    const codexHome = path.join(root, "codex-home");
    const stateDir = path.join(root, "state");
    const cloudList = path.join(root, "cloud-list.json");
    await mkdir(codexHome, { recursive: true });
    await writeFile(path.join(codexHome, "auth.json"), JSON.stringify({
      auth_mode: "chatgpt",
      OPENAI_API_KEY: null,
      tokens: { account_id: rawAccountId },
    }), "utf8");
    await writeFile(path.join(codexHome, "installation_id"), `${rawInstallationId}\n`, "utf8");
    await writeFile(cloudList, JSON.stringify({ tasks: [{
      id: "task-destiny-integration",
      title: "Implement repository change",
      summary: `GitHub request ${probeId}: create the bounded Destiny marker`,
      url: "https://chatgpt.com/codex/tasks/task-destiny-integration",
      environment_id: rawEnvironmentId,
    }] }), "utf8");

    const stdout = execFileSync(process.execPath, [
      SCRIPT,
      "--probe-id", probeId,
      "--codex-home", codexHome,
      "--state-dir", stateDir,
      "--cloud-list-file", cloudList,
    ], { encoding: "utf8", windowsHide: true });
    const result = JSON.parse(stdout);
    assert.equal(result.ready, true);
    assert.equal(result.probeId, probeId);
    assert.match(result.codexAccountFingerprint, /^[a-f0-9]{64}$/);
    assert.match(result.codexInstallationFingerprint, /^[a-f0-9]{64}$/);
    assert.match(result.codexEnvironmentFingerprint, /^[a-f0-9]{64}$/);
    assert.match(result.receiptKeyFingerprint, /^[a-f0-9]{64}$/);
    assert.deepEqual(result.files, ["binding.json", "trust-snippet.json", "readiness.json", "receipt-public-key.pem"]);
    assert.equal(stdout.includes(rawAccountId), false);
    assert.equal(stdout.includes(rawInstallationId), false);
    assert.equal(stdout.includes(rawEnvironmentId), false);
    assert.equal(stdout.includes(root), false);

    const binding = await readFile(path.join(stateDir, "binding.json"), "utf8");
    assert.equal(binding.includes(rawAccountId), false);
    assert.equal(binding.includes(rawInstallationId), false);
    assert.equal(binding.includes(rawEnvironmentId), false);
    const trust = JSON.parse(await readFile(path.join(stateDir, "trust-snippet.json"), "utf8"));
    const manifest = validateDestinyTriggerTrustManifest({
      schemaVersion: 1,
      triggerId: "destiny-event-dispatch-v1",
      repository: "michaeljwilliams0123/mahoraga",
      owner: "michaeljwilliams0123",
      readinessMaxAgeMs: 300000,
      zeroCreditRequired: true,
      receiptTrust: trust,
    });
    assert.equal(manifest.receiptTrust.mode, "signed-receipt");
    const readiness = JSON.parse(await readFile(path.join(stateDir, "readiness.json"), "utf8"));
    assert.equal(readiness.codexAccountFingerprint, result.codexAccountFingerprint);
    assert.equal(evaluateDestinyTriggerReadiness(manifest, readiness, { now: readiness.observedAt }).ready, true);
    assert.match(await readFile(path.join(stateDir, "receipt-private-key.pem"), "utf8"), /BEGIN PRIVATE KEY/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("Destiny bootstrap fails closed when the exact GitHub probe is not visible in the logged-in account", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "mahoraga-destiny-bootstrap-miss-"));
  try {
    const codexHome = path.join(root, "codex-home");
    const stateDir = path.join(root, "state");
    const cloudList = path.join(root, "cloud-list.json");
    await mkdir(codexHome, { recursive: true });
    await writeFile(path.join(codexHome, "auth.json"), JSON.stringify({ tokens: { account_id: rawAccountId } }), "utf8");
    await writeFile(path.join(codexHome, "installation_id"), rawInstallationId, "utf8");
    await writeFile(cloudList, JSON.stringify({ tasks: [] }), "utf8");
    assert.throws(() => execFileSync(process.execPath, [
      SCRIPT,
      "--probe-id", probeId,
      "--codex-home", codexHome,
      "--state-dir", stateDir,
      "--cloud-list-file", cloudList,
    ], { encoding: "utf8", windowsHide: true, stdio: "pipe" }), /Command failed/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
