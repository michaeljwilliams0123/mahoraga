import test from "node:test";
import assert from "node:assert/strict";
import { loadManifest } from "../src/config.mjs";
import { buildGapAudit } from "../src/gap-audit.mjs";

test("gap audit distinguishes closed repository controls from live-machine blockers", async () => {
  const manifest = await loadManifest();
  const report = buildGapAudit(manifest, { root: "/synthetic", fileExists: () => true });

  assert.equal(report.scope, "repository-declared-state-only");
  assert.equal(report.liveWindowsRuntimeVerified, false);

  const closed = new Set(report.closed.map((item) => item.id));
  const open = new Map(report.open.map((item) => [item.id, item]));

  for (const id of [
    "localhost-runtime-boundary",
    "owner-update-authority",
    "chromebook-control-plane",
    "cross-platform-ci",
    "desktop-worker-contract",
    "microsoft-queue-readiness-contract",
    "local-provider-readiness-probe",
    "local-reasoner-health-contract",
    "secondary-codex-mailbox",
    "no-default-metered-openai-api",
  ]) assert.ok(closed.has(id), `expected closed control: ${id}`);

  for (const id of ["desktop-worker", "signed-browser-session", "microsoft-durable-queue", "local-reasoner"]) {
    assert.ok(open.has(id), `expected remaining gap: ${id}`);
    assert.equal(open.get(id).state, "blocked");
  }

  assert.match(open.get("desktop-worker").dependency, /providers:probe/i);
  assert.match(open.get("microsoft-durable-queue").dependency, /providers:probe/i);
  assert.match(open.get("local-reasoner").dependency, /transient result channel/i);
  assert.ok(!open.has("no-default-metered-openai-api"));
});

test("gap audit does not claim file-backed controls when their files are absent", async () => {
  const manifest = await loadManifest();
  const report = buildGapAudit(manifest, { root: "/synthetic", fileExists: () => false });
  const closed = new Set(report.closed.map((item) => item.id));
  assert.ok(!closed.has("chromebook-control-plane"));
  assert.ok(!closed.has("cross-platform-ci"));
  assert.ok(!closed.has("desktop-worker-contract"));
  assert.ok(!closed.has("microsoft-queue-readiness-contract"));
  assert.ok(!closed.has("local-provider-readiness-probe"));
  assert.ok(!closed.has("local-reasoner-health-contract"));
});
