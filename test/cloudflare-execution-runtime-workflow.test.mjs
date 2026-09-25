import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const workflowPath = path.join(root, ".github/workflows/cloudflare-execution-runtime.yml");
const billingAttestationPath = path.join(root, "scripts/cloudflare-zero-credit-attestation.mjs");
const runtimeWorkerPath = path.join(root, "deploy/cloudflare-execution-runtime/worker.ts");
const runtimeWranglerPath = path.join(root, "deploy/cloudflare-execution-runtime/wrangler.jsonc");

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
  assert.equal((workflow.match(/CLOUDFLARE_BILLING_READ_TOKEN:\s*\$\{\{ secrets\.CLOUDFLARE_BILLING_READ_TOKEN \}\}/g) ?? []).length, 2,
    "deployment and hourly renewal must both receive the billing read token");
  assert.match(workflow, /CLOUDFLARE_ACCOUNT_ID:\s*\$\{\{ secrets\.CLOUDFLARE_ACCOUNT_ID \}\}/);
  assert.match(workflow, /CLOUDFLARE_ACCESS_CLIENT_ID:\s*\$\{\{ secrets\.CLOUDFLARE_ACCESS_CLIENT_ID \}\}/);
  assert.match(workflow, /CLOUDFLARE_ACCESS_CLIENT_SECRET:\s*\$\{\{ secrets\.CLOUDFLARE_ACCESS_CLIENT_SECRET \}\}/);
  assert.match(workflow, /ZERO_CREDIT_PROVIDER_TOKEN:\s*\$\{\{ secrets\.ZERO_CREDIT_PROVIDER_TOKEN \}\}/);
  assert.match(workflow, /PROVIDER_REFRESH_SECRET:\s*\$\{\{ secrets\.PROVIDER_REFRESH_SECRET \}\}/);
  assert.match(workflow, /Cloudflare deployment credentials are not configured/);
  assert.match(workflow, /Cloudflare Access credentials are not configured/);
  assert.match(workflow, /Hard-zero provider credentials are not configured/);
});

test("Cloudflare exact-main workflow proves account billing before deploying provider, runtime, and acceptance", async () => {
  const [workflow, billingAttestationScript] = await Promise.all([
    readFile(workflowPath, "utf8"),
    readFile(billingAttestationPath, "utf8"),
  ]);
  const billingAttestation = workflow.indexOf("cloudflare-zero-credit-attestation.mjs");
  const providerDeploy = workflow.indexOf("Deploy isolated budgeted Workers AI provider");
  const runtimeDeploy = workflow.indexOf("cloudflare-execution-runtime.ts deploy");
  const refresh = workflow.indexOf("Refresh hard-zero provider admission");
  const accept = workflow.indexOf("cloudflare-production-acceptance.ts");
  assert.ok(billingAttestation >= 0, "independent Cloudflare account evidence must be collected");
  assert.ok(providerDeploy > billingAttestation, "isolated provider must deploy only after account billing is proved Free");
  assert.ok(runtimeDeploy > providerDeploy, "execution runtime must deploy after the isolated provider");
  assert.ok(refresh > runtimeDeploy, "provider state refresh must follow runtime deployment");
  assert.ok(accept > refresh, "live cognition/replay acceptance must follow provider admission");
  assert.match(workflow, /ZERO_CREDIT_PROVIDER_URL:/);
  assert.match(workflow, /ZERO_CREDIT_ACCOUNT_ID_HASH/);
  assert.match(billingAttestationScript, /workers\/account-settings/);
  assert.match(billingAttestationScript, /\/subscriptions/);
  assert.match(workflow, /--secrets-file "\$PROVIDER_SECRETS_FILE"/);
  assert.match(workflow, /cloudflare-execution-runtime\.ts deploy --sha "\$VERIFIED_SHA" --secrets-file "\$RUNTIME_SECRETS_FILE"/);
  assert.doesNotMatch(workflow, /openssl rand -hex 32/);
  assert.doesNotMatch(workflow, /secret put ZERO_CREDIT_PROVIDER_TOKEN/);
  assert.doesNotMatch(workflow, /secret put PROVIDER_REFRESH_SECRET/);
  assert.match(workflow, /provider-admitted/);
  assert.equal(
    workflow.match(/JSON\.stringify\(body\.diagnostics \?\? null\)/g)?.length,
    2,
    "deployment and renewal failures must surface the sanitized admission matrix",
  );
});

test("Cloudflare billing proof renews externally before expiry without redeploying Workers", async () => {
  const [workflow, runtimeWorker, runtimeWrangler] = await Promise.all([
    readFile(workflowPath, "utf8"),
    readFile(runtimeWorkerPath, "utf8"),
    readFile(runtimeWranglerPath, "utf8"),
  ]);
  assert.match(workflow, /schedule:\s*\n\s*- cron:\s*"17 \* \* \* \*"/);
  const renewalJob = workflow.indexOf("renew-provider-admission:");
  const billingProof = workflow.indexOf("cloudflare-zero-credit-attestation.mjs", renewalJob);
  const refreshCall = workflow.indexOf("/api/provider/refresh", renewalJob);
  assert.ok(renewalJob >= 0, "hourly external renewal job must exist");
  assert.ok(billingProof > renewalJob, "renewal must re-prove account billing");
  assert.ok(refreshCall > billingProof, "fresh attestation must be submitted only after billing proof");
  const renewalBlock = workflow.slice(renewalJob);
  assert.match(renewalBlock, /billingAttestation/);
  assert.doesNotMatch(renewalBlock, /wrangler@[^\n]* deploy|cloudflare-execution-runtime\.ts deploy|cloudflare:owner-gateway:deploy/);
  assert.doesNotMatch(runtimeWrangler, /"crons"\s*:/, "Cloudflare cron must not recycle deployment-time billing evidence");
  assert.doesNotMatch(runtimeWorker, /async scheduled\(/, "runtime must not self-renew billing evidence without account API proof");
  assert.match(runtimeWorker, /provider-refresh-attestation-invalid/);
  assert.doesNotMatch(runtimeWorker, /ZERO_CREDIT_BILLING_ATTESTATION/);
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
  assert.doesNotMatch(workflow, /(?:POST|PUT|PATCH|DELETE)[^\n]*\/subscriptions|topup|spending-limit/i);
});

test("Cloudflare exact-main workflow promotes dependencies inside-out before the owner gateway", async () => {
  const workflow = await readFile(workflowPath, "utf8");
  const gatewayDeploy = workflow.indexOf("cloudflare:owner-gateway:deploy");
  const providerDeploy = workflow.indexOf("Deploy isolated budgeted Workers AI provider");
  const runtimeDeploy = workflow.indexOf("cloudflare-execution-runtime.ts deploy");
  const refresh = workflow.indexOf("Refresh hard-zero provider admission");
  const accept = workflow.indexOf("cloudflare-production-acceptance.ts");
  assert.ok(gatewayDeploy >= 0, "owner gateway must be deployed from the exact verified checkout");
  assert.ok(providerDeploy >= 0, "isolated provider must deploy from exact verified main");
  assert.ok(runtimeDeploy > providerDeploy, "execution runtime must deploy after isolated provider");
  assert.ok(refresh > runtimeDeploy, "provider admission must refresh after runtime deployment");
  assert.ok(gatewayDeploy > refresh, "owner gateway must deploy after its accepted dependencies");
  assert.ok(accept > gatewayDeploy, "live acceptance must run after all Cloudflare deployments");
});

test("Cloudflare exact-main workflow resolves runner temp paths at runtime instead of invalid job context", async () => {
  const workflow = await readFile(workflowPath, "utf8");
  assert.doesNotMatch(workflow, /\$\{\{\s*runner\.temp\s*\}\}/, "runner context is invalid in job-level env and makes workflow_dispatch unparsable");
  assert.match(workflow, /RUNNER_TEMP/);
  assert.match(workflow, /PROVIDER_SECRETS_FILE=.*mahoraga-zero-credit-provider-secrets\.json/);
  assert.match(workflow, /RUNTIME_SECRETS_FILE=.*mahoraga-execution-runtime-secrets\.json/);
  assert.match(workflow, /BILLING_ATTESTATION_FILE=.*mahoraga-zero-credit-billing-attestation\.json/);
  assert.match(workflow, /GITHUB_ENV/);
  assert.match(workflow, /name:\s*Remove temporary Cloudflare secret files/);
  assert.match(workflow, /if:\s*always\(\)/);
  assert.match(workflow, /rm -f "\$PROVIDER_SECRETS_FILE" "\$RUNTIME_SECRETS_FILE" "\$BILLING_ATTESTATION_FILE"/);
});
