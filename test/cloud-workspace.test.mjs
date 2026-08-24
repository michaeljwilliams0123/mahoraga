import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { ROOT } from "../src/config.mjs";

const read = (relative) => readFile(path.join(ROOT, relative), "utf8");

test("cloud workspace is credential-free and never controls localhost", async () => {
  const [html, app, docs] = await Promise.all([read("cloud/index.html"), read("cloud/app.js"), read("docs/CLOUD-WORKSPACE.md")]);
  assert.match(html, /Content-Security-Policy/);
  assert.match(html, /connect-src https:\/\/api\.github\.com/);
  assert.match(app, /https:\/\/api\.github\.com\/repos\//);
  assert.doesNotMatch(`${html}\n${app}`, /localStorage|sessionStorage|Authorization|github_pat_|gh[pousr]_|OPENAI_API_KEY/);
  assert.doesNotMatch(app, /fetch\([^)]*,\s*\{[^}]*method:\s*['"](?:POST|PUT|PATCH|DELETE)/s);
  assert.doesNotMatch(`${html}\n${app}`, /ngrok|0\.0\.0\.0|127\.0\.0\.1:4782|http:\/\/localhost/i);
  assert.match(docs, /localhost runtime remains bound to `127\.0\.0\.1`/);
});

test("cloud task handoff keeps prompts out of URLs and exposes real skills and lanes", async () => {
  const [html, app, template] = await Promise.all([read("cloud/index.html"), read("cloud/app.js"), read(".github/ISSUE_TEMPLATE/codex-cloud-task.yml")]);
  assert.match(app, /navigator\.clipboard\.writeText/);
  assert.doesNotMatch(app, /encodeURIComponent\(state\.draft\)/);
  assert.match(html, /Submission and file upload happen in GitHub/);
  assert.match(template, /id: attachments/);
  assert.match(template, /Attachments inherit repository visibility/);
  assert.match(template, /does not spend model credits/);
  assert.match(html, /data-view="skills"/);
  assert.match(html, /data-view="approvals"/);
  assert.match(html, /data-view="releases"/);
  assert.match(html, /id="execution-lane"/);
  assert.match(html, /GitHub Copilot/);
  assert.match(html, /Codex cloud/);
  assert.match(html, /Desktop Codex/);
  assert.match(html, /Deterministic Actions/);
  assert.match(html, /\/mahoraga dispatch codex/);
  assert.match(template, /label: Preferred execution lane/);
  assert.match(app, /github\('\/releases\?per_page=12'\)/);
  assert.doesNotMatch(template, /^\s+- codex:queued\s*$/m);
  assert.doesNotMatch(app, /state\.draft\.split/);
});

test("Mahoraga 4 fleet is honest about profile, relay, launch, and artifact state", async () => {
  const [html, app] = await Promise.all([read("cloud/index.html"), read("cloud/app.js")]);
  for (const profile of ["mahoraga-coordinator", "mahoraga-relay", "mahoraga-assurance", "mahoraga-experience"]) {
    assert.match(html, new RegExp(`data-agent-profile="${profile}"`));
    assert.match(html, new RegExp(`<option value="${profile}">`));
  }
  assert.match(html, /Protocol 3\.0\.1/);
  assert.match(html, /At-least-once/);
  assert.match(html, /Idempotent/);
  assert.match(html, /Fenced/);
  assert.match(html, /Cloud launch unavailable/);
  assert.match(html, /Owner action/);
  assert.match(html, /Private artifact plane/);
  assert.match(html, /not active/i);
  assert.match(html, /public-safe/i);
  assert.match(app, /value = 'copilot'/);
  assert.doesNotMatch(`${html}\n${app}`, /cloud launch active|private artifact (?:service|storage) active/i);
});

test("Pages deployment is least-privilege and immutable", async () => {
  const workflow = await read(".github/workflows/pages.yml");
  assert.match(workflow, /contents: read/);
  assert.match(workflow, /pages: write/);
  assert.match(workflow, /id-token: write/);
  for (const action of ["actions/checkout", "actions/configure-pages", "actions/upload-pages-artifact", "actions/deploy-pages"]) {
    assert.match(workflow, new RegExp(`${action.replace("/", "\\/")}@[a-f0-9]{40}`));
  }
  assert.doesNotMatch(workflow, /\$\{\{\s*secrets\.|OPENAI_API_KEY/);
  assert.match(workflow, /path: cloud/);
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
