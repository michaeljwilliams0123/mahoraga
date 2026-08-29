import test from "node:test";
import assert from "node:assert/strict";
import { readFile, mkdtemp, rm, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { ROOT } from "../src/config.mjs";
import { createStaticSelfUpgradePolicyProfile, createSelfUpgradeInstruction, validateSelfUpgradeInstruction } from "../src/self-upgrade-instruction.mjs";

const baseCommit = "ec81509e9fc14858745af0caed1ffe1753d557bc";
const execFileAsync = promisify(execFile);
const expected = {
  schemaVersion: 1,
  instructionId: "self-upgrade-zero-credit-v1",
  projectId: "mahoraga",
  baseCommit,
  mode: "candidate-only",
  providerOrder: ["codespaces-open-weight", "local-open-weight", "deterministic-only", "waiting-zero-credit-provider"],
  normalCreditBudget: 0,
  hostedComputeSpendCeilingUsd: 0,
  allowedActions: ["project.inspect", "project.patch", "project.verify", "workflow.run"],
  verificationCommandIds: ["verify"],
  integration: "pull-request-only",
  maximumFiles: 16,
  maximumDurationMs: 7_200_000,
  maximumRepairAttempts: 2,
  checkpointRequired: true,
  rollbackRequired: true,
};

test("self-upgrade instruction fixes zero-credit candidate-only authority", () => {
  const instruction = createStaticSelfUpgradePolicyProfile({ instructionId: expected.instructionId, baseCommit });
  assert.deepEqual(instruction, expected);
  assert.equal(Object.isFrozen(instruction), true);
  assert.equal(Object.isFrozen(instruction.providerOrder), true);
});

test("self-upgrade instruction rejects paid, direct-main, and arbitrary execution", () => {
  for (const mutation of [
    { normalCreditBudget: 1 },
    { hostedComputeSpendCeilingUsd: 0.01 },
    { providerOrder: ["codex"] },
    { allowedActions: [...expected.allowedActions, "shell.run"] },
    { verificationCommandIds: ["npm run verify"] },
    { integration: "direct-main" },
    { checkpointRequired: false },
    { rollbackRequired: false },
  ]) {
    assert.throws(() => validateSelfUpgradeInstruction({ ...expected, ...mutation }), /Self-upgrade instruction/);
  }
  assert.throws(() => validateSelfUpgradeInstruction({ ...expected, prompt: "improve yourself" }), /field is not allowed/);
});

test("canonical self-upgrade policy profile is non-executable metadata without prompts or commands", async () => {
  const file = path.join(ROOT, "coordination", "zero-credit", "self-upgrade-v1.json");
  const record = validateSelfUpgradeInstruction(JSON.parse(await readFile(file, "utf8")));
  assert.deepEqual(record, expected);
  assert.equal(JSON.stringify(record).includes("prompt"), false);
  assert.equal(JSON.stringify(record).includes("command"), false);
});


test("validator CLI accepts the canonical profile and rejects a malformed temporary profile", async () => {
  const node = process.execPath;
  const script = path.join(ROOT, "scripts", "self-upgrade-instruction.mjs");
  const canonical = path.join(ROOT, "coordination", "zero-credit", "self-upgrade-v1.json");
  const tempDirectory = await mkdtemp(path.join(ROOT, "coordination", "zero-credit", "self-upgrade-test-"));
  const malformed = path.join(tempDirectory, "malformed.json");
  try {
    await writeFile(malformed, JSON.stringify({ ...expected, allowedActions: ["project.inspect", "shell.run"] }));
    const canonicalResult = await execFileAsync(node, [script, "validate", "--file", path.relative(ROOT, canonical).replaceAll(path.sep, "/")], { cwd: ROOT });
    assert.match(canonicalResult.stdout, /"receiptType":"self-upgrade-policy-validation".*"policyType":"static-policy-profile".*"executable":false/);
    await assert.rejects(
      execFileAsync(node, [script, "validate", "--file", path.relative(ROOT, malformed).replaceAll(path.sep, "/")], { cwd: ROOT }),
      /allowed action identifiers|project\.inspect|invalid/i,
    );
  } finally {
    await rm(tempDirectory, { recursive: true, force: true });
  }
});
test("validator CLI rejects unrecognized arguments and paths outside the owned policy directory", async () => {
  const node = process.execPath;
  const script = path.join(ROOT, "scripts", "self-upgrade-instruction.mjs");
  await assert.rejects(execFileAsync(node, [script, "validate", "--unexpected", "value"], { cwd: ROOT }), /Only --file/);
  await assert.rejects(execFileAsync(node, [script, "validate", "--file", "package.json"], { cwd: ROOT }), /under coordination\/zero-credit/);
  await assert.rejects(execFileAsync(node, [script, "validate", "--file", "coordination/zero-credit/../package.json"], { cwd: ROOT }), /normalized|owned/);
});