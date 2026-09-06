import test from "node:test";
import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { ROOT } from "../src/config.mjs";

const read = (relative) => readFile(path.join(ROOT, relative), "utf8");

test("the single workspace is a credential-free encrypted client of one Mahoraga core", async () => {
  const [config, workspace, relay, chatRoute, docs] = await Promise.all([
    read("cloud-app/next.config.ts"),
    read("cloud-app/components/workspace.tsx"),
    read("cloud-app/lib/runtime-relay.ts"),
    read("cloud-app/app/api/chat/route.ts"),
    read("docs/CLOUD-WORKSPACE.md"),
  ]);
  assert.match(config, /wss:\/\/relay\.mahoraga\.app/);
  assert.match(relay, /wss:\/\/relay\.mahoraga\.app\/pair/);
  assert.doesNotMatch(`${workspace}\n${relay}`, /github_pat_|gh[pousr]_|OPENAI_API_KEY|localStorage|sessionStorage/);
  assert.doesNotMatch(workspace, /DefaultChatTransport|useChat\(/);
  assert.doesNotMatch(workspace, /conversationRoute|Cloud Pro/);
  assert.match(workspace, /RuntimeRelay/);
  assert.match(workspace, /One core authority/);
  assert.match(chatRoute, /core-gateway-required/);
  assert.doesNotMatch(chatRoute, /streamText|@ai-sdk\/gateway|cloudBrowserTool/);
  assert.match(docs, /single Vercel-hosted workspace/i);
  assert.match(docs, /No second local or Pages UI/i);
});

test("legacy Pages, static cloud, and loopback UI entry points stay retired", async () => {
  for (const relative of [".github/workflows/pages.yml", "cloud/index.html", "web/index.html"]) {
    await assert.rejects(access(path.join(ROOT, relative)), { code: "ENOENT" });
  }
  const [server, integration] = await Promise.all([
    read("src/server.mjs"),
    read(".github/workflows/autonomous-integration.yml"),
  ]);
  assert.match(server, /interactionSurface: "vercel-workspace"/);
  assert.match(server, /localUiRetired: true/);
  assert.doesNotMatch(integration, /pages\.yml|DEPLOY_PAGES/);
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
