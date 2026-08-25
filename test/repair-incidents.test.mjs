import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { RuntimeDatabase } from "../src/database.mjs";
import { advanceRepairIncident, reconcileRepairIncidents, repairIncidentId } from "../src/repair-incidents.mjs";

const BASELINE = "7.0.0-alpha.1:state/release-baseline";
const ISSUE = Object.freeze({
  relative: "src/runtime.mjs",
  condition: "live-file-missing-or-empty",
  expectedSha256: "a".repeat(64),
  observedSha256: null,
  baselineVersion: BASELINE,
});

test("repair incidents open once, remain quiet while unchanged, and resolve once", () => {
  const first = reconcileRepairIncidents([], [ISSUE], { baselineVersion: BASELINE, now: () => new Date("2030-01-01T00:00:00Z") });
  assert.deepEqual(first.events.map((event) => event.type), ["repair-incident-opened"]);
  const unchanged = reconcileRepairIncidents(first.incidents, [ISSUE], { baselineVersion: BASELINE, now: () => new Date("2030-01-01T00:01:00Z") });
  assert.deepEqual(unchanged.events, []);
  const resolved = reconcileRepairIncidents(unchanged.incidents, [], { baselineVersion: BASELINE, now: () => new Date("2030-01-01T00:02:00Z") });
  assert.deepEqual(resolved.events.map((event) => event.type), ["repair-incident-resolved"]);
});

test("incident identity changes only with path, expected digest, condition, or baseline", () => {
  const id = repairIncidentId(ISSUE, BASELINE);
  assert.equal(repairIncidentId({ ...ISSUE, observedSha256: "b".repeat(64) }, BASELINE), id);
  assert.notEqual(repairIncidentId({ ...ISSUE, expectedSha256: "c".repeat(64) }, BASELINE), id);
  assert.notEqual(repairIncidentId({ ...ISSUE, condition: "baseline-file-out-of-date" }, BASELINE), id);
  assert.notEqual(repairIncidentId({ ...ISSUE, baselineVersion: "7.0.0-alpha.2:state/release-baseline" }, BASELINE), id);
});

test("recovery transitions preserve failure and rollback evidence", () => {
  const opened = reconcileRepairIncidents([], [ISSUE], { baselineVersion: BASELINE }).incidents[0];
  const attempted = advanceRepairIncident(opened, "recovery-attempted");
  assert.equal(attempted.incident.recoveryState, "attempted");
  const failed = advanceRepairIncident(attempted.incident, "recovery-failed", { errorCode: "verification-failed" });
  assert.equal(failed.incident.status, "failed");
  const rolledBack = advanceRepairIncident(failed.incident, "recovery-rolled-back", { errorCode: "repair-rolled-back" });
  assert.equal(rolledBack.incident.recoveryState, "rolled-back");
});

test("database persists only incident transitions and no file content", (t) => {
  const root = mkdtempSync(path.join(os.tmpdir(), "mahoraga-repair-incidents-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const database = new RuntimeDatabase(path.join(root, "runtime.sqlite"), { allowLegacyPlaintextWrites: true });
  t.after(() => database.close());
  const first = database.reconcileRepairIncidents([ISSUE], BASELINE, new Date("2030-01-01T00:00:00Z"));
  const eventCount = database.listEvents().length;
  const unchanged = database.reconcileRepairIncidents([ISSUE], BASELINE, new Date("2030-01-01T00:01:00Z"));
  assert.equal(first.events.length, 1);
  assert.equal(unchanged.events.length, 0);
  assert.equal(database.listEvents().length, eventCount);
  assert.doesNotMatch(JSON.stringify(database.listRepairIncidents()), /file content/);
});

test("supervisor source does not enqueue periodic automatic repair tasks", () => {
  const source = readFileSync(new URL("../src/supervisor.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(source, /automatic-operational-repair|#scheduleAutomaticRepair/);
  assert.match(source, /#scheduleRepairIncidentScan/);
});
