import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const route = new URL("../app/api/runtime/action/route.ts", import.meta.url);
const actions = new URL("../lib/cloud-runtime-action.ts", import.meta.url);
const relay = new URL("../lib/runtime-relay.ts", import.meta.url);
const view = new URL("../components/workspace/connections-view.tsx", import.meta.url);
const workspace = new URL("../components/workspace.tsx", import.meta.url);

test("cloud workspace exposes the bounded Composio GitHub probe through the owner relay", async () => {
  const [routeText, actionText, relayText, viewText, workspaceText] = await Promise.all([
    readFile(route, "utf8"), readFile(actions, "utf8"), readFile(relay, "utf8"), readFile(view, "utf8"), readFile(workspace, "utf8"),
  ]);
  assert.match(routeText, /dispatchCloudRuntimeAction/);
  assert.match(actionText, /"composio-github-repository"/);
  assert.match(actionText, /ALLOWED_CLOUD_RUNTIME_ACTIONS/);
  assert.match(relayText, /composioGithubRepository\(owner: string, repo: string\)/);
  assert.match(relayText, /this\.call<RuntimeComposioRepositoryProbe>\("composio-github-repository"/);
  assert.match(viewText, /Probe Composio GitHub/);
  assert.match(viewText, /GitHub write authority observed; probe remains read-only/);
  assert.match(workspaceText, /relay=\{pairedRelay\}/);
  assert.doesNotMatch(routeText + actionText + relayText + viewText + workspaceText, /COMPOSIO_API_KEY/);
});
