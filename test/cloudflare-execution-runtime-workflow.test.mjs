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

test("Cloudflare exact-main workflow deploys budgeted provider before runtime, refreshes admission, then accepts", async () => {
  const workflow = await readFile(workflowPath, "utf8");
  const providerDeploy = workflow.indexOf("Deploy isolated budgeted Workers AI provider");
  const runtimeDeploy = workflow.indexOf("cloudflare-execution-runtime.ts deploy");
  const refresh = workflow.indexOf("Refresh hard-zero provider admission");
  const accept = workflow.indexOf("cloudflare-production-acceptance.ts");
  assert.ok(providerDeploy >= 0, "isolated provider must deploy from exact verified main");
  assert.ok(runtimeDeploy > providerDeploy, "execution runtime must deploy after the isolated provider");
  assert.ok(refresh > runtimeDeploy, "provider state refresh must follow runtime deployment");
  assert.ok(accept > refresh, "live cognition/replay acceptance must follow provider admission");
  assert.match(workflow, /ZERO_CREDIT_PROVIDER_URL:/);
  assert.match(workflow, /ZERO_CREDIT_ACCOUNT_ID_HASH/);
  assert.match(workflow, /openssl rand -hex 32/);
  assert.match(workflow, /secret put ZERO_CREDIT_PROVIDER_TOKEN/);
  assert.match(workflow, /secret put PROVIDER_REFRESH_SECRET/);
  assert.match(workflow, /provider-admitted/);
});

test("Cloudflare exact-main workflow deploys before strengthened live acceptance and does not mutate Railway or billing", async () => {
  const workflow = await readFile(workflowPath, "utf8");
  const deploy = workflow.indexOf("cloudflare-execution-runtime.ts deploy");
  const accept = workflow.indexOf("cloudflare-production-acceptance.ts");
  assert.ok(deploy >= 0);
  assert.ok(accept > deploy);
  assert.match(workflow, /--receipt reports\/cloudflare-execution-runtime-acceptance\.json/);
  assert.doesNotMatch(workflow, /cloudflare-execution-runtime\.ts accept/);
  assert.doesNotMatch(workflow, /railway\s+(up|deploy|delete|remove|down)|RAILWAY_PROJECT_TOKEN/i);
  assert.doesNotMatch(workflow, /subscriptions|billing|topup|spending-limit/i);
});

test("Cloudflare exact-main workflow deploys the owner gateway before isolated provider and execution-runtime acceptance", async () => {
  const workflow = await readFile(workflowPath, "utf8");
  const gatewayDeploy = workflow.indexOf("cloudflare:owner-gateway:deploy");
  const providerDeploy = workflow.indexOf("Deploy isolated budgeted Workers AI provider");
  const runtimeDeploy = workflow.indexOf("cloudflare-execution-runtime.ts deploy");
  const accept = workflow.indexOf("cloudflare-production-acceptance.ts");
  assert.ok(gatewayDeploy >= 0, "owner gateway must be deployed from the exact verified checkout");
  assert.ok(providerDeploy > gatewayDeploy, "isolated provider must deploy after owner gateway");
  assert.ok(runtimeDeploy > providerDeploy, "execution runtime must deploy after isolated provider");
  assert.ok(accept > runtimeDeploy, "live acceptance must run after all Cloudflare deployments");
});
