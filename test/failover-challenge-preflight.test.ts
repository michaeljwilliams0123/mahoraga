import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, appendFileSync, rmSync } from "node:fs";
import { open } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { inventoryFailoverChallengeRoutes, readFailoverChallengeSnapshot } from "../scripts/failover-challenge-preflight.ts";

const now = Date.parse("2026-10-15T12:00:00Z");
const route = (provider = "cloudflare", workerId = "cloudflare-readonly-inspector") => ({
  capability: "cloud.inspect", provider, workerId, permissionClass: "read",
  routable: true, enabled: true, costClass: "deterministic", evidenceLevel: "runtime-execution",
  lastObservedAt: new Date(now - 1000).toISOString(), expiresAt: new Date(now + 30_000).toISOString(),
});
const pool = (routes: unknown[]) => ({ schemaVersion: 1, kind: "universal-capability-pool", routes });

test("inventory reports actual registry shortage without treating a single route as failover evidence", () => {
  const report = inventoryFailoverChallengeRoutes(pool([route()]), "cloud.inspect", now);
  assert.equal(report.status, "blocked");
  assert.equal(report.compatibleProviderCount, 1);
  assert.equal(report.requiredDistinctProviders, 3);
  assert.equal(report.executionChallengeVerified, false);
  assert.equal(report.executionAuthorityGranted, false);
  assert.equal(report.reasonCode, "three-distinct-compatible-admitted-providers-required");
});

test("same provider workers and unsupported capability aliases cannot manufacture independent providers", () => {
  const report = inventoryFailoverChallengeRoutes(pool([
    route(), route("cloudflare", "second-cloud-worker"), route("github", "repo-worker"),
    route("railway", "legacy-worker"), route("integration", "integration-worker"),
  ]), "cloud.inspect", now);
  assert.equal(report.compatibleProviderCount, 1);
  assert.equal(report.status, "blocked");
});

test("stale, future, disabled, paid, incomplete and malformed routes never qualify", () => {
  for (const alteration of [
    { expiresAt: new Date(now).toISOString() }, { lastObservedAt: new Date(now + 5001).toISOString() },
    { lastObservedAt: new Date(now - 300_001).toISOString() }, { costClass: "metered-cloud" },
    { routable: false }, { enabled: false }, { evidenceLevel: "source-only" }, { workerId: "private/value" },
  ]) {
    assert.equal(inventoryFailoverChallengeRoutes(pool([{ ...route(), ...alteration }]), "cloud.inspect", now)
      .compatibleProviderCount, 0);
  }
  assert.throws(() => inventoryFailoverChallengeRoutes({}, "cloud.inspect", now), /failover-inventory-invalid/);
});

test("repository aliases share one actual binding rather than counting as distinct providers", () => {
  const report = inventoryFailoverChallengeRoutes(pool([
    { ...route("github", "repo-primary"), capability: "repository.inspect" },
    { ...route("repository", "repo-alias"), capability: "repository.inspect" },
  ]), "repository.inspect", now);
  assert.equal(report.compatibleProviderCount, 1);
});

test("CLI returns a blocked sanitized inventory and never echoes malformed private input", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "mahoraga-failover-inventory-"));
  try {
    const filename = path.join(directory, "capture.json");
    const script = fileURLToPath(new URL("../scripts/failover-challenge-preflight.ts", import.meta.url));
    writeFileSync(filename, JSON.stringify({ ...pool([]), privateBody: "Bearer private-capture-token" }));
    const blocked = spawnSync(process.execPath, [script, filename, "cloud.inspect"], { encoding: "utf8" });
    assert.equal(blocked.status, 1);
    assert.equal(JSON.parse(blocked.stdout).status, "blocked");
    assert.doesNotMatch(blocked.stdout + blocked.stderr, /Bearer|private-capture-token/);
    writeFileSync(filename, "Bearer private-capture-token");
    const invalid = spawnSync(process.execPath, [script, filename, "cloud.inspect"], { encoding: "utf8" });
    assert.equal(invalid.status, 1);
    assert.equal(invalid.stdout, "");
    assert.equal(invalid.stderr.trim(), "failover-inventory-invalid");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("CLI rejects oversized regular files and directories without exposing their paths", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "private-failover-capture-"));
  try {
    const filename = path.join(directory, "private-oversized-capture.json");
    writeFileSync(filename, " ".repeat(1_048_577));
    const script = fileURLToPath(new URL("../scripts/failover-challenge-preflight.ts", import.meta.url));
    for (const input of [filename, directory]) {
      const result = spawnSync(process.execPath, [script, input, "cloud.inspect"], { encoding: "utf8" });
      assert.equal(result.status, 1);
      assert.equal(result.stdout, "");
      assert.equal(result.stderr.trim(), "failover-inventory-invalid");
      assert.doesNotMatch(result.stderr, /private-failover|private-oversized|Error:|EISDIR/);
    }
    const valid = JSON.stringify(pool([]));
    writeFileSync(filename, valid + " ".repeat(1_048_576 - Buffer.byteLength(valid)));
    const boundary = spawnSync(process.execPath, [script, filename, "cloud.inspect"], { encoding: "utf8" });
    assert.equal(boundary.status, 1);
    assert.equal(boundary.stderr, "");
    assert.equal(JSON.parse(boundary.stdout).status, "blocked");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("regular-file snapshot reads reject growth after the initial stat, including within the byte limit", async t => {
  const directory = mkdtempSync(path.join(tmpdir(), "mahoraga-failover-growing-"));
  try {
    const filename = path.join(directory, "capture.json");
    for (const padding of [1, 1_048_577]) {
      writeFileSync(filename, JSON.stringify(pool([])));
      const file = await open(filename, "r");
      try {
        const stat = file.stat.bind(file);
        let initial = true;
        t.mock.method(file, "stat", async () => {
          const metadata = await stat();
          if (initial) {
            initial = false;
            appendFileSync(filename, " ".repeat(padding));
          }
          return metadata;
        });
        const reads = t.mock.method(file, "read");
        await assert.rejects(readFailoverChallengeSnapshot(file), /failover-inventory-invalid/);
        assert.ok(reads.mock.calls.length > 0);
        for (const call of reads.mock.calls) {
          const buffer: unknown = call.arguments[0];
          assert.ok(Buffer.isBuffer(buffer));
          assert.ok(buffer.length <= 1_048_577);
        }
      } finally {
        await file.close();
      }
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
