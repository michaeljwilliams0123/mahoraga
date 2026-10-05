import test from "node:test";
import assert from "node:assert/strict";
import { loadGithubWorkspace } from "../lib/github-workspace.ts";

const snapshot = { repository: "michaeljwilliams0123/mahoraga", observedAt: "2026-10-05T13:00:00Z", readOnly: true, pages: { state: "denied", url: null, status: null, buildType: null, reason: "github-native-http-403" }, actions: { state: "available", runs: [], failedRunId: null, failedJobs: [], reason: null, failureDetailsReason: null } };
test("workspace connection loads Pages and Actions once and preserves partial access", async () => {
  let calls = 0;
  const states = [];
  loadGithubWorkspace({ nativeGithubWorkspace: async () => { calls++; return snapshot; } }, state => states.push(state));
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(calls, 1);
  assert.deepEqual(states.map(state => state.phase), ["loading", "ready"]);
  assert.equal(states[1].snapshot.pages.state, "denied");
});
test("disconnect discards a late workspace result", async () => {
  let resolve;
  const states = [];
  const cancel = loadGithubWorkspace({ nativeGithubWorkspace: () => new Promise(done => { resolve = done; }) }, state => states.push(state));
  await Promise.resolve();
  cancel();
  resolve(snapshot);
  await new Promise(done => setTimeout(done, 0));
  assert.deepEqual(states.map(state => state.phase), ["loading"]);
});
test("workspace errors never expose arbitrary provider details", async () => {
  const states = [];
  loadGithubWorkspace({ nativeGithubWorkspace: async () => { throw new Error("private provider payload"); } }, state => states.push(state));
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(states[1].phase, "error");
  assert.equal(states[1].reason, "github-native-workspace-unavailable");
});
test("malformed runtime records cannot become a ready workspace", async () => {
  const states = [];
  loadGithubWorkspace({ nativeGithubWorkspace: async () => ({ ...snapshot, actions: { ...snapshot.actions, runs: [{ id: 0 }] } }) }, state => states.push(state));
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(states[1].phase, "error");
  assert.equal(states[1].reason, "github-native-workspace-response-invalid");
});
