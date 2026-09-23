import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const workflowPath = path.join(root, ".github/workflows/cloudflare-execution-runtime.yml");

test("Cloudflare exact-main workflow is hosted, owner-bound, and verify-gated", async () => {
  const workflow = await readFile(workflowPath, "utf8");
  assert.match(workflow, /workflows:\s*\["Verify Mahoraga"\]/);
  assert.match(workflow, /github\.event\.workflow_run\.conclusion == 'success'/);
  assert.match(workflow, /github\.event\.workflow_run\.event == 'push'/);
  assert.match(workflow, /github\.event\.workflow_run\.head_branch == 'main'/);
  assert.match(workflow, /github\.event\.workflow_run\.actor\.login == github\.repository_owner/);
  assert.match(workflow, /runs-on:\s*ubuntu-latest/);
  assert.doesNotMatch(workflow, /runs-on:\s*\[self-hosted/);
});

test("Cloudflare exact-main workflow preserves SHA authority and fails closed on credentials", async () => {
  const workflow = await readFile(workflowPath, "utf8");
  assert.match(workflow, /VERIFIED_SHA:/);
  assert.match(workflow, /node scripts\/verify-exact-head\.mjs/);
  assert.match(workflow, /CLOUDFLARE_API_TOKEN:\s*\$\{\{ secrets\.CLOUDFLARE_API_TOKEN \}\}/);
  assert.match(workflow, /CLOUDFLARE_ACCOUNT_ID:\s*\$\{\{ secrets\.CLOUDFLARE_ACCOUNT_ID \}\}/);
  assert.match(workflow, /CLOUDFLARE_ACCESS_CLIENT_ID:\s*\$\{\{ secrets\.CLOUDFLARE_ACCESS_CLIENT_ID \}\}/);
  assert.match(workflow, /CLOUDFLARE_ACCESS_CLIENT_SECRET:\s*\$\{\{ secrets\.CLOUDFLARE_ACCESS_CLIENT_SECRET \}\}/);
  assert.match(workflow, /Cloudflare deployment credentials are not configured/);
  assert.match(workflow, /Cloudflare Access credentials are not configured/);
});

test("Cloudflare exact-main workflow deploys before strengthened live acceptance and does not mutate Railway", async () => {
  const workflow = await readFile(workflowPath, "utf8");
  const deploy = workflow.indexOf("cloudflare-execution-runtime.ts deploy");
  const accept = workflow.indexOf("cloudflare-production-acceptance.ts");
  assert.ok(deploy >= 0);
  assert.ok(accept > deploy);
  assert.match(workflow, /--receipt reports\/cloudflare-execution-runtime-acceptance\.json/);
  assert.doesNotMatch(workflow, /cloudflare-execution-runtime\.ts accept/);
  assert.doesNotMatch(workflow, /railway\s+(up|deploy|delete|remove|down)|RAILWAY_PROJECT_TOKEN/i);
});

test("Cloudflare exact-main workflow deploys the owner gateway before strengthened execution-runtime acceptance", async () => {
  const workflow = await readFile(workflowPath, "utf8");
  const gatewayDeploy = workflow.indexOf("cloudflare:owner-gateway:deploy");
  const runtimeDeploy = workflow.indexOf("cloudflare-execution-runtime.ts deploy");
  const accept = workflow.indexOf("cloudflare-production-acceptance.ts");
  assert.ok(gatewayDeploy >= 0, "owner gateway must be deployed from the exact verified checkout");
  assert.ok(runtimeDeploy > gatewayDeploy, "execution runtime must deploy after the owner gateway");
  assert.ok(accept > runtimeDeploy, "live acceptance must run after both Cloudflare deployments");
});
