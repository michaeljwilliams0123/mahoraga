import test from "node:test";
import assert from "node:assert/strict";
import { loadManifest } from "../src/config.mjs";
import { buildGapAudit } from "../src/gap-audit.mjs";

test("gap audit distinguishes closed repository controls from live-machine blockers", async () => {
  const manifest = await loadManifest();
  const verifiedAt = new Date().toISOString();
  const contractIds = [
    "localhost-runtime-boundary", "verified-automatic-update-authority", "chromebook-control-plane", "cross-platform-ci",
    "desktop-worker-contract", "microsoft-queue-readiness-contract", "local-provider-readiness-probe", "local-reasoner-health-contract",
    "secondary-codex-mailbox", "no-default-metered-openai-api", "owner-approved-cloud-gateway", "verified-attested-update-channel",
  ];
  const report = buildGapAudit(manifest, {
    root: "/synthetic",
    fileExists: () => true,
    evidence: {
      runtime: { verified: true, host: "127.0.0.1", verifiedAt },
      contracts: Object.fromEntries(contractIds.map((id) => [id, { verified: true, verifiedAt, verifier: "test-contract" }])),
    },
  });

  assert.equal(report.scope, "evidence-backed-contract-and-runtime-state");
  assert.equal(report.liveWindowsRuntimeVerified, true);
  assert.equal(report.version, "7.0.0-alpha.1");

  const closed = new Set(report.closed.map((item) => item.id));
  const open = new Map(report.open.map((item) => [item.id, item]));

  for (const id of [
    "localhost-runtime-boundary",
    "verified-automatic-update-authority",
    "chromebook-control-plane",
    "cross-platform-ci",
    "desktop-worker-contract",
    "microsoft-queue-readiness-contract",
    "local-provider-readiness-probe",
    "local-reasoner-health-contract",
    "secondary-codex-mailbox",
    "no-default-metered-openai-api",
    "owner-approved-cloud-gateway",
    "verified-attested-update-channel",
  ]) assert.ok(closed.has(id), `expected closed control: ${id}`);

  for (const id of ["signed-browser-session", "microsoft-durable-queue", "local-reasoner"]) {
    assert.ok(open.has(id), `expected remaining gap: ${id}`);
    assert.equal(open.get(id).state, "blocked");
  }

  assert.match(open.get("microsoft-durable-queue").dependency, /providers:probe/i);
  assert.match(open.get("local-reasoner").dependency, /transient result channel/i);
  assert.ok(!open.has("no-default-metered-openai-api"));
});

test("gap audit does not claim file-backed controls when their files are absent", async () => {
  const manifest = await loadManifest();
  const verifiedAt = new Date().toISOString();
  const evidence = { contracts: Object.fromEntries(["chromebook-control-plane", "cross-platform-ci", "desktop-worker-contract", "microsoft-queue-readiness-contract", "local-provider-readiness-probe", "local-reasoner-health-contract", "owner-approved-cloud-gateway", "verified-attested-update-channel"].map((id) => [id, { verified: true, verifiedAt }])) };
  const report = buildGapAudit(manifest, { root: "/synthetic", fileExists: () => false, evidence });
  const closed = new Set(report.closed.map((item) => item.id));
  assert.ok(!closed.has("chromebook-control-plane"));
  assert.ok(!closed.has("cross-platform-ci"));
  assert.ok(!closed.has("desktop-worker-contract"));
  assert.ok(!closed.has("microsoft-queue-readiness-contract"));
  assert.ok(!closed.has("local-provider-readiness-probe"));
  assert.ok(!closed.has("local-reasoner-health-contract"));
  assert.ok(!closed.has("owner-approved-cloud-gateway"));
  assert.ok(!closed.has("verified-attested-update-channel"));
});

test("gap audit treats declarations as supporting evidence, never closure evidence", async () => {
  const manifest = await loadManifest();
  const report = buildGapAudit(manifest, { root: "/synthetic", fileExists: () => true });
  const unverified = report.open.find((item) => item.id === "cross-platform-ci");
  assert.equal(report.closed.length, 0);
  assert.equal(unverified.state, "unverified");
  assert.equal(unverified.evidenceLevel, "supporting");
});
