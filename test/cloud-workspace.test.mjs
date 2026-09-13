import test from "node:test";
import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { ROOT } from "../src/config.mjs";

const read = (relative) => readFile(path.join(ROOT, relative), "utf8");

async function readWorkspaceSurface() {
  const [workspace, shell, chatView] = await Promise.all([
    read("cloud-app/components/workspace.tsx"),
    read("cloud-app/components/workspace/workspace-shell.tsx"),
    read("cloud-app/components/workspace/chat-view.tsx"),
  ]);
  return `${workspace}\n${shell}\n${chatView}`;
}

test("the single workspace is a credential-free encrypted client of one Mahoraga core", async () => {
  const [config, workspace, relay, docs] = await Promise.all([
    read("cloud-app/next.config.ts"),
    readWorkspaceSurface(),
    read("cloud-app/lib/runtime-relay.ts"),
    read("docs/CLOUD-WORKSPACE.md"),
  ]);
  assert.match(config, /wss:\/\/mahoraga-relay\.mahoraga-mjw0123\.workers\.dev/);
  assert.match(relay, /wss:\/\/mahoraga-relay\.mahoraga-mjw0123\.workers\.dev\/pair/);
  assert.doesNotMatch(`${workspace}\n${relay}`, /github_pat_|gh[pousr]_|OPENAI_API_KEY|localStorage|sessionStorage/);
  assert.doesNotMatch(workspace, /DefaultChatTransport|useChat\(/);
  assert.doesNotMatch(workspace, /conversationRoute|Cloud Pro/);
  assert.match(workspace, /RuntimeRelay/);
  assert.match(workspace, /chat:\s*"workspace".*work:\s*"work".*files:\s*"files".*advanced:\s*"advanced"/s);
  assert.match(workspace, /Execution stays with the paired core/i);
  assert.match(workspace, /browser never stores GitHub credentials/i);
  await assert.rejects(access(path.join(ROOT, "cloud-app/app/api/chat/route.ts")), { code: "ENOENT" });
  assert.match(docs, /single cloud-hosted workspace and only browser UI/i);
  assert.match(docs, /host-neutral/i);
  assert.match(docs, /derived static export of this same source/i);
  assert.match(docs, /MAHORAGA_WORKSPACE_URL[\s\S]*MAHORAGA_WORKSPACE_ORIGIN/i);
});

test("legacy duplicate UI entry points stay retired and Pages publishes cloud-app", async () => {
  for (const relative of ["cloud/index.html", "web/index.html"]) {
    await assert.rejects(access(path.join(ROOT, relative)), { code: "ENOENT" });
  }
  const [server, integration, pages] = await Promise.all([
    read("src/server.mjs"),
    read(".github/workflows/autonomous-integration.yml"),
    read(".github/workflows/pages.yml"),
  ]);
  assert.doesNotMatch(server, /https:\/\/michaeljwilliams0123\.github\.io\/mahoraga\//);
  assert.match(server, /interactionSurface: "configured-workspace-origin"/);
  assert.match(server, /localUiRetired: true/);
  assert.match(pages, /cloud-app/);
  assert.match(pages, /deploy-pages/);
  assert.doesNotMatch(integration, /DEPLOY_PAGES/);
});

test("cloud gateway workflow is owner-only, event-file parsed, and model-free", async () => {
  const workflow = await read(".github/workflows/cloud-task-gateway.yml");
  assert.match(workflow, /issue_comment:/);
  assert.match(workflow, /github\.actor == github\.repository_owner/);
  assert.match(workflow, /startsWith\(github\.event\.comment\.body, '\/mahoraga dispatch '\)/);
  assert.match(workflow, /--event "\$GITHUB_EVENT_PATH"/);
  assert.match(workflow, /node scripts\/coordination\.mjs validate/);
  assert.match(workflow, /node scripts\/codex-cloud-task\.mjs dispatch-bundle/);
  assert.doesNotMatch(workflow, /OPENAI_API_KEY|codex exec|\$\{\{\s*secrets\./);
});
