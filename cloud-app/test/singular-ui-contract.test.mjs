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

test("legacy repo-root Git deployment is disabled while canonical cloud-app deployment remains enabled", async () => {
  const [rootConfigSource, appConfigSource] = await Promise.all([
    read("../vercel.json"),
    read("vercel.json"),
  ]);
  const rootConfig = JSON.parse(rootConfigSource);
  const appConfig = JSON.parse(appConfigSource);
  assert.equal(rootConfig.git?.deploymentEnabled, false);
  assert.equal(appConfig.git?.deploymentEnabled, true);
  assert.equal(rootConfig.outputDirectory, "cloud-app/.next");
});

test("repository declares only the canonical Vercel workspace alias", async () => {
  const sources = await Promise.all([
    read("../README.md"),
    read("README.md"),
    read("../docs/CLOUD-WORKSPACE.md"),
    read("../docs/CLOUD-ONLY-DEPLOYMENT.md"),
    read("../docs/OPERATOR-CONSOLE.md"),
    read("../operator-deck/README.md"),
    read("../scripts/open-workspace.ps1"),
  ]);
  for (const source of sources) {
    assert.match(source, /https:\/\/mahoraga-workspace\.vercel\.app\//);
    assert.doesNotMatch(source, /mahoraga-cloud-workspace\.vercel\.app/);
    assert.doesNotMatch(source, /mahoraga-workspace-prod\.vercel\.app/);
    assert.doesNotMatch(source, /mahoraga-workspace-app\.vercel\.app/);
  }
});
