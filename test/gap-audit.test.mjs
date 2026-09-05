import test from "node:test";
import assert from "node:assert/strict";
import { loadManifest } from "../src/config.mjs";
import { buildGapAudit } from "../src/gap-audit.mjs";

const CONTRACT_IDS = [
  "localhost-runtime-boundary", "verified-automatic-update-authority", "browser-worker-baseline", "repository-worker-baseline",
  "automatic-operational-repair", "chromebook-control-plane", "cross-platform-ci",
  "desktop-worker-contract", "microsoft-queue-readiness-contract", "local-provider-readiness-probe", "local-reasoner-health-contract",
  "credit-free-heartbeat",
  "secondary-codex-mailbox", "no-default-metered-openai-api", "owner-approved-cloud-gateway", "verified-attested-update-channel",
];

const FILE_BACKED_IDS = [
  "chromebook-control-plane", "cross-platform-ci", "desktop-worker-contract", "microsoft-queue-readiness-contract",
  "local-provider-readiness-probe", "local-reasoner-health-contract", "credit-free-heartbeat", "owner-approved-cloud-gateway", "verified-attested-update-channel",
];

const RUNTIME_BLOCKED_IDS = ["signed-browser-session", "microsoft-durable-queue", "local-reasoner"];

test("gap audit distinguishes closed repository controls from live-machine blockers", async () => {
  const manifest = await loadManifest();
  const verifiedAt = new Date().toISOString();
  const report = buildGapAudit(manifest, {
    root: "/synthetic",
    fileExists: () => true,
    evidence: {
      runtime: { verified: true, host: "127.0.0.1", verifiedAt },
      contracts: Object.fromEntries(CONTRACT_IDS.map((id) => [id, { verified: true, verifiedAt, verifier: "test-contract" }])),
    },
  });

  assert.equal(report.scope, "evidence-backed-contract-and-runtime-state");
  assert.equal(report.liveWindowsRuntimeVerified, true);
  assert.equal(report.version, "7.0.0-alpha.1");

  const closed = new Map(report.closed.map((item) => [item.id, item]));
  const open = new Map(report.open.map((item) => [item.id, item]));

  for (const id of CONTRACT_IDS) {
    assert.ok(closed.has(id), `expected closed control: ${id}`);
    assert.equal(closed.get(id).state, "closed");
    assert.equal(closed.get(id).evidenceLevel, "verified");
  }

  for (const id of RUNTIME_BLOCKED_IDS) {
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
  const evidence = { contracts: Object.fromEntries(FILE_BACKED_IDS.map((id) => [id, { verified: true, verifiedAt }])) };
  const report = buildGapAudit(manifest, { root: "/synthetic", fileExists: () => false, evidence });
  const closed = new Set(report.closed.map((item) => item.id));
  for (const id of FILE_BACKED_IDS) assert.ok(!closed.has(id), `absent file must not close ${id}`);
});

test("gap audit closes contract gaps from file and manifest proof without live Windows evidence", async () => {
  const manifest = await loadManifest();
  const report = buildGapAudit(manifest, { root: "/synthetic", fileExists: () => true });
  const closed = new Map(report.closed.map((item) => [item.id, item]));
  const open = new Map(report.open.map((item) => [item.id, item]));

  assert.equal(report.liveWindowsRuntimeVerified, false);
  assert.ok(report.closed.length > 0);
  assert.match(report.note, /contract gaps/i);

  for (const id of CONTRACT_IDS) {
    assert.ok(closed.has(id), `expected closed contract: ${id}`);
    assert.equal(closed.get(id).state, "closed");
    assert.equal(closed.get(id).evidenceLevel, "contract");
    assert.equal(closed.get(id).verifier, "contract-declaration");
  }

  for (const id of RUNTIME_BLOCKED_IDS) {
    assert.ok(open.has(id), `expected remaining runtime gap: ${id}`);
    assert.equal(open.get(id).state, "blocked");
  }

  assert.ok(!open.has("cross-platform-ci"));
  assert.ok(!open.has("no-default-metered-openai-api"));
  assert.ok(!open.has("automatic-operational-repair"));
});
