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
  for (const label of ["Chat", "Work", "Files", "Advanced"]) {
    assert.match(types, new RegExp(`label: "${label}"`));
  }
  for (const retired of ["Agents", "Plugins & Connections", "Files & Data", "Browser", "Automations", "Activity", "Settings"]) {
    assert.doesNotMatch(types, new RegExp(`label: "${retired}"`));
  }
  assert.doesNotMatch(workspace, /function placeholder\(/);
  assert.doesNotMatch(workspace, /will land in a later track|land in Track B|will reuse core task/i);
  assert.match(workspace, /view === "advanced"/);
  assert.match(workspace, /ConnectionsView/);
  assert.match(workspace, /OperationsView/);
  assert.match(workspace, /CockpitView/);
});

test("control center exposes deployment identity and paired-core capability readiness", async () => {
  const cockpit = await read("components/cockpit/CockpitView.tsx");
  assert.match(cockpit, /Control Center/);
  assert.match(cockpit, /deployment\?\.provider/);
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

test("health route publishes host-neutral deployment identity with Vercel fallback", async () => {
  const health = await read("app/api/health/route.ts");
  assert.match(health, /version:\s*"7\.0\.0-alpha\.2"/);
  assert.match(health, /deployment:/);
  for (const portable of [
    "MAHORAGA_DEPLOYMENT_PROVIDER",
    "MAHORAGA_DEPLOYMENT_ENV",
    "MAHORAGA_DEPLOYMENT_URL",
    "MAHORAGA_GIT_COMMIT_SHA",
    "MAHORAGA_GIT_COMMIT_REF",
  ]) {
    assert.match(health, new RegExp(portable));
  }
  assert.match(health, /provider:/);
  assert.match(health, /VERCEL_GIT_COMMIT_SHA/);
  assert.match(health, /VERCEL_GIT_COMMIT_REF/);
  assert.match(health, /VERCEL_ENV/);
  assert.match(health, /VERCEL_URL/);
});

test("Vercel entrypoints are frozen while hosting migrates away from exhausted quota", async () => {
  const [rootConfigSource, appConfigSource] = await Promise.all([
    read("../vercel.json"),
    read("vercel.json"),
  ]);
  for (const config of [JSON.parse(rootConfigSource), JSON.parse(appConfigSource)]) {
    assert.equal(config.git?.deploymentEnabled, false);
  }
  assert.equal(JSON.parse(rootConfigSource).outputDirectory, "cloud-app/.next");
});

test("repository declares one canonical workspace source without reviving legacy deployments", async () => {
  const sources = await Promise.all([
    read("../README.md"),
    read("README.md"),
    read("../docs/CLOUD-WORKSPACE.md"),
    read("../docs/CLOUD-ONLY-DEPLOYMENT.md"),
    read("../docs/OPERATOR-CONSOLE.md"),
    read("../operator-deck/README.md"),
    read("../scripts/open-workspace.ps1"),
  ]);
  for (const source of sources.slice(0, -1)) {
    assert.match(source, /cloud-app\//);
    assert.doesNotMatch(source, /mahoraga-cloud-workspace\.vercel\.app/);
    assert.doesNotMatch(source, /mahoraga-workspace-prod\.vercel\.app/);
    assert.doesNotMatch(source, /mahoraga-workspace-app\.vercel\.app/);
  }

  const rootReadme = sources[0];
  assert.match(rootReadme, /Deployment availability is observed[\s\S]*separately from source verification/);
  assert.match(rootReadme, /former Pages URL[\s\S]*must not be presented as live/);
});
