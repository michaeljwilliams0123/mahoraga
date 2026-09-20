import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { runtimeTaskPhase } from "../lib/task-lifecycle.ts";

const workspace = await readFile(new URL("../components/workspace.tsx", import.meta.url), "utf8");

test("runtime task lifecycle keeps only executing states busy", () => {
  for (const status of ["queued", "claimed", "running", "verifying"]) {
    assert.equal(runtimeTaskPhase(status), "active", `${status} must keep the workspace busy`);
  }
});

test("waiting and completed runtime tasks settle the workspace", () => {
  for (const status of ["waiting", "waiting_for_user", "completed", "failed", "cancelled"]) {
    assert.equal(runtimeTaskPhase(status), "settled", `${status} must stop the working spinner`);
  }
});

test("unknown task states fail closed instead of inventing lifecycle semantics", () => {
  assert.equal(runtimeTaskPhase("succeeded"), "unknown");
  assert.equal(runtimeTaskPhase("rejected"), "unknown");
  assert.equal(runtimeTaskPhase("future-state"), "unknown");
});

test("workspace polling consumes the shared lifecycle contract", () => {
  assert.match(workspace, /runtimeTaskPhase\(task\.status\) === "active"/);
  assert.match(workspace, /runtimeTaskPhase\(task\.status\) === "settled"/);
  assert.doesNotMatch(workspace, /ACTIVE_TASK_STATES|TERMINAL_TASK_STATES/);
});

test("routing changes settle immediately with retryable owner-facing copy", () => {
  assert.match(workspace, /"routing-changed": "Mahoraga paused because the available execution route changed/);
  assert.match(workspace, /trackedSettledTask\?\.errorCode/);
  assert.match(workspace, /setRuntimeError\(runtimeErrorMessage\(trackedSettledTask\.errorCode\)\);\s*return;/);
});
