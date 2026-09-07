import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8").catch(() => "");

test("workspace navigation exposes only complete singular surfaces", async () => {
  const [types, workspace] = await Promise.all([
    read("components/workspace/workspace-types.ts"),
    read("components/workspace.tsx"),
  ]);
  for (const label of ["Chat", "Control Center", "Operations", "Connections"]) {
    assert.match(types, new RegExp(`label: "${label}"`));
  }
  for (const retired of ["Agents", "Plugins & Connections", "Files & Data", "Browser", "Automations", "Activity", "Settings"]) {
    assert.doesNotMatch(types, new RegExp(`label: "${retired}"`));
  }
  assert.doesNotMatch(workspace, /function placeholder\(/);
  assert.doesNotMatch(workspace, /will land in a later track|land in Track B|will reuse core task/i);
  assert.match(workspace, /ConnectionsView/);
});

test("control center exposes deployment identity and paired-core capability readiness", async () => {
  const cockpit = await read("components/cockpit/CockpitView.tsx");
  assert.match(cockpit, /Control Center/);
  assert.match(cockpit, /deployment\?\.commitSha/);
  assert.match(cockpit, /deployment\?\.environment/);
  assert.match(cockpit, /runtimeCapabilities/);
  assert.match(cockpit, /automaticPaidFallback/);
  assert.doesNotMatch(cockpit, /127\.0\.0\.1:11434|api\.github\.com/);
});

test("connections surface reports relay capabilities without gaining direct authority", async () => {
  const source = await read("components/workspace/connections-view.tsx");
  assert.match(source, /RuntimeCapability/);
  assert.match(source, /workerIds/);
  assert.match(source, /routable/);
  assert.match(source, /Pair runtime/);
  assert.match(source, /Disconnect/);
  assert.doesNotMatch(source, /api\.github\.com|@ai-sdk\/|confirmationToken/);
});

test("health route publishes non-secret deployment identity", async () => {
  const health = await read("app/api/health/route.ts");
  assert.match(health, /version:\s*"7\.0\.0-alpha\.2"/);
  assert.match(health, /deployment:/);
  assert.match(health, /VERCEL_GIT_COMMIT_SHA/);
  assert.match(health, /VERCEL_GIT_COMMIT_REF/);
  assert.match(health, /VERCEL_ENV/);
  assert.match(health, /VERCEL_URL/);
});

test("both Vercel entrypoints enable Git deployment and root build targets nested Next output", async () => {
  const [rootConfig, appConfig] = await Promise.all([
    read("../vercel.json"),
    read("vercel.json"),
  ]);
  for (const config of [rootConfig, appConfig]) {
    assert.doesNotMatch(config, /"deploymentEnabled"\s*:\s*false/);
    assert.match(config, /"deploymentEnabled"\s*:\s*true/);
  }
  assert.match(rootConfig, /"outputDirectory"\s*:\s*"cloud-app\/\.next"/);
});
