import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import path from "node:path";

const runtimeModule = new URL("../src/state/candidate-runtime.mjs", import.meta.url);
const cliModule = new URL("../src/cli-arguments.mjs", import.meta.url);

async function loadRuntimeContract() {
  assert.equal(existsSync(runtimeModule), true, "src/state/candidate-runtime.mjs must exist");
  return import(runtimeModule.href);
}

async function loadCliContract() {
  assert.equal(existsSync(cliModule), true, "src/cli-arguments.mjs must exist");
  return import(cliModule.href);
}

test("4783 resolves isolated candidate runtime and UCCP state", async () => {
  const { resolveCandidateRuntimePaths } = await loadRuntimeContract();
  const root = path.resolve("/tmp/mahoraga-contract");
  const manifest = { runtime: { database: "state/mahoraga.sqlite" }, truthContracts: { contentVault: { root: "state/content-vault" } } };
  const candidate = resolveCandidateRuntimePaths({ root, manifest, port: 4783 });
  assert.equal(candidate.candidate, true);
  assert.equal(candidate.stateRoot, path.join(root, "state", "candidate-4783"));
  assert.equal(candidate.databaseFile, path.join(candidate.stateRoot, "mahoraga.sqlite"));
  assert.equal(candidate.uccpDatabaseFile, path.join(candidate.stateRoot, "uccp.sqlite"));
  assert.notEqual(candidate.databaseFile, path.join(root, manifest.runtime.database));
  assert.equal(candidate.artifactRoot, path.join(candidate.stateRoot, "artifacts"));
  assert.equal(candidate.contentVaultRoot, path.join(candidate.stateRoot, "content-vault"));
});

test("normal runtime keeps canonical manifest state", async () => {
  const { resolveCandidateRuntimePaths } = await loadRuntimeContract();
  const root = path.resolve("/tmp/mahoraga-contract-normal");
  const manifest = { runtime: { database: "state/mahoraga.sqlite" }, truthContracts: { contentVault: { root: "state/content-vault" } } };
  const normal = resolveCandidateRuntimePaths({ root, manifest, port: 4782 });
  assert.equal(normal.candidate, false);
  assert.equal(normal.databaseFile, path.join(root, "state", "mahoraga.sqlite"));
  assert.equal(normal.uccpDatabaseFile, null);
});

test("CLI accepts only the explicit candidate alternate port", async () => {
  const { parseCliArguments } = await loadCliContract();
  assert.deepEqual(parseCliArguments(["start", "--port", "4783"]), { command: "start", argument: null, port: 4783 });
  assert.deepEqual(parseCliArguments(["submit", "system.health"]), { command: "submit", argument: "system.health", port: null });
  assert.throws(() => parseCliArguments(["start", "--port", "9999"]), /cli-runtime-port-not-allowed/);
  assert.throws(() => parseCliArguments(["status", "--port", "4783"]), /cli-port-only-valid-for-start/);
});