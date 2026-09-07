import test from "node:test";
import assert from "node:assert/strict";
import { findCodexCloudTaskByProbeId } from "../src/codex-connection-identity.mjs";

const environmentId = "env-mahoraga";
const probeId = "destiny-bind-pr181-20260907-a1b2c3d4";

test("probe correlation survives Codex title rewriting by matching the unique token in title or summary", () => {
  const bySummary = findCodexCloudTaskByProbeId({ tasks: [
    { id: "task-other", title: "Other task", summary: "nothing relevant", environment_id: environmentId },
    { id: "task-destiny", title: "Implement repository change", summary: `GitHub request ${probeId}: create the bounded Destiny marker`, environment_id: environmentId },
  ] }, probeId);
  assert.equal(bySummary.id, "task-destiny");

  const byTitle = findCodexCloudTaskByProbeId({ tasks: [
    { id: "task-destiny-title", title: `Implement ${probeId}`, summary: null, environment_id: environmentId },
  ] }, probeId);
  assert.equal(byTitle.id, "task-destiny-title");
});

test("probe correlation is exact-token and ambiguity fail-closed", () => {
  assert.throws(() => findCodexCloudTaskByProbeId({ tasks: [] }, probeId), /codex-cloud-task-not-visible/);
  assert.throws(() => findCodexCloudTaskByProbeId({ tasks: [
    { id: "task-1", title: probeId, summary: null, environment_id: environmentId },
    { id: "task-2", title: "another", summary: probeId, environment_id: environmentId },
  ] }, probeId), /codex-cloud-task-ambiguous/);
  assert.throws(() => findCodexCloudTaskByProbeId({ tasks: [
    { id: "task-prefix", title: `${probeId}-extra`, summary: null, environment_id: environmentId },
  ] }, probeId), /codex-cloud-task-not-visible/);
});
