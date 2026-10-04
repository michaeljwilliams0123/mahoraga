import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const route = new URL("../app/api/runtime/action/route.ts", import.meta.url);
const actions = new URL("../lib/cloud-runtime-action.ts", import.meta.url);
const relay = new URL("../lib/runtime-relay.ts", import.meta.url);
const view = new URL("../components/workspace/connections-view.tsx", import.meta.url);
const workspace = new URL("../components/workspace.tsx", import.meta.url);

test("cloud workspace exposes bounded native GitHub App actions through the owner relay", async () => {
  const [routeText, actionText, relayText, viewText, workspaceText] = await Promise.all([
    readFile(route, "utf8"), readFile(actions, "utf8"), readFile(relay, "utf8"), readFile(view, "utf8"), readFile(workspace, "utf8"),
  ]);
  assert.match(routeText, /dispatchCloudRuntimeAction/);
  assert.match(actionText, /"native-github-repository"/);
  assert.match(actionText, /"native-github-pull-request"/);
  assert.match(relayText, /nativeGithubRepository\(\)/);
  assert.match(relayText, /this\.call<RuntimeGithubAppRepositoryProbe>\("native-github-repository"/);
  assert.match(relayText, /nativeGithubPullRequest\(proposal: RuntimeGithubAppPullRequestProposal\)/);
  assert.match(relayText, /this\.call<RuntimeGithubAppPullRequestReceipt>\("native-github-pull-request"/);
  assert.match(viewText, /Probe native GitHub App/);
  assert.match(viewText, /Repository-scoped write authority observed; probe remains read-only/);
  assert.match(workspaceText, /relay=\{pairedRelay\}/);
  assert.doesNotMatch(routeText + actionText + relayText + viewText + workspaceText, /COMPOSIO_/);
});
