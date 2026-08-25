import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createExecutionCell, inspectExecutionCell, quarantineExecutionCell, removeExecutionCell } from "../src/execution-cell.mjs";

function repository(t) {
  const root = mkdtempSync(path.join(os.tmpdir(), "mahoraga-cell-"));
  mkdirSync(path.join(root, "src"), { recursive: true });
  writeFileSync(path.join(root, ".gitignore"), "state/\n", "utf8");
  writeFileSync(path.join(root, "src", "allowed.txt"), "base\n", "utf8");
  git(root, "init", "--initial-branch=main");
  git(root, "config", "user.email", "mahoraga@example.invalid");
  git(root, "config", "user.name", "Mahoraga Test");
  git(root, "add", ".");
  git(root, "commit", "-m", "base");
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return { root, baseCommit: git(root, "rev-parse", "HEAD").trim() };
}

function contract(repo, overrides = {}) {
  return {
    taskId: "mhg-execution-cell-test",
    executionSessionId: "cdb-execution-cell-test",
    repositoryRoot: repo.root,
    baseCommit: repo.baseCommit,
    allowedPaths: ["src/allowed.txt"],
    integrationLeaseId: "int-00000000-0000-4000-8000-000000000001",
    integrationLease: {
      leaseId: "int-00000000-0000-4000-8000-000000000001",
      paths: ["src"],
      expiresAt: "2099-08-25T12:00:00.000Z",
    },
    ...overrides,
  };
}

test("Codex execution cells are detached from the authoritative checkout and inspect committed allowed changes", async (t) => {
  const repo = repository(t);
  const cell = await createExecutionCell(contract(repo));
  assert.match(cell.path, /state[\\/]execution-cells[\\/]codex[\\/]cell-/);
  assert.notEqual(cell.path, repo.root);
  writeFileSync(path.join(cell.path, "src", "allowed.txt"), "candidate\n", "utf8");
  git(cell.path, "add", "src/allowed.txt");
  git(cell.path, "commit", "-m", "candidate");
  const inspection = await inspectExecutionCell(cell);
  assert.deepEqual(inspection.violations, []);
  assert.deepEqual(inspection.changedPaths, ["src/allowed.txt"]);
  assert.notEqual(inspection.headCommit, inspection.baseCommit);
  const removed = await removeExecutionCell(cell);
  assert.equal(removed.removed, true);
  assert.equal(existsSync(cell.path), false);
});

test("execution-cell creation fails closed for dirty roots, missing leases, and path escape", async (t) => {
  const repo = repository(t);
  await assert.rejects(createExecutionCell(contract(repo, { integrationLease: null })), /integration-lease-not-active/);
  await assert.rejects(createExecutionCell(contract(repo, { allowedPaths: ["../outside"] })), /execution-cell-repository-path-invalid/);
  writeFileSync(path.join(repo.root, "dirty.txt"), "dirty\n", "utf8");
  await assert.rejects(createExecutionCell(contract(repo)), /authoritative-checkout-dirty/);
});

test("out-of-scope candidate changes are quarantined with metadata-only evidence", async (t) => {
  const repo = repository(t);
  const cell = await createExecutionCell(contract(repo));
  writeFileSync(path.join(cell.path, "outside.txt"), "out of scope\n", "utf8");
  git(cell.path, "add", "outside.txt");
  git(cell.path, "commit", "-m", "out of scope");
  const inspection = await inspectExecutionCell(cell);
  assert.ok(inspection.violations.includes("changed-path-outside-allowlist:outside.txt"));
  const quarantined = await quarantineExecutionCell(cell, inspection.violations[0]);
  assert.equal(quarantined.quarantineState, "quarantined");
  assert.equal(existsSync(quarantined.quarantineMarker), true);
  await removeExecutionCell(cell);
});

function git(cwd, ...args) {
  return execFileSync("git", args, { cwd, encoding: "utf8", windowsHide: true });
}
