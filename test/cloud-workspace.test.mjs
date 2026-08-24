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

test("cloud task handoff keeps prompts out of URLs and makes attachment visibility explicit", async () => {
  const [html, app, template] = await Promise.all([read("cloud/index.html"), read("cloud/app.js"), read(".github/ISSUE_TEMPLATE/codex-cloud-task.yml")]);
  assert.match(app, /navigator\.clipboard\.writeText/);
  assert.doesNotMatch(app, /encodeURIComponent\(state\.draft\)/);
  assert.match(html, /Submission and file upload happen in GitHub/);
  assert.match(template, /id: attachments/);
  assert.match(template, /Attachments inherit repository visibility/);
  assert.match(template, /does not spend model credits/);
  assert.doesNotMatch(template, /^\s+- codex:queued\s*$/m);
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
