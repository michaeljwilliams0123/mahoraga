import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const workflowPath = path.join(root, ".github/workflows/cloudflare-execution-runtime.yml");
const renewalWorkflowPath = path.join(root, ".github/workflows/cloudflare-provider-renewal.yml");
const billingAttestationPath = path.join(root, "src/cloudflare-zero-credit-billing.ts");
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
  const [workflow, renewalWorkflow] = await Promise.all([
    readFile(workflowPath, "utf8"),
    readFile(renewalWorkflowPath, "utf8"),
  ]);
  assert.match(workflow, /VERIFIED_SHA:/);
  assert.match(workflow, /node scripts\/verify-exact-head\.mjs/);
  assert.match(workflow, /CLOUDFLARE_API_TOKEN:\s*\$\{\{ secrets\.CLOUDFLARE_API_TOKEN \}\}/);
  assert.equal((workflow.match(/CLOUDFLARE_BILLING_READ_TOKEN:\s*\$\{\{ secrets\.CLOUDFLARE_BILLING_READ_TOKEN \}\}/g) ?? []).length, 1);
  assert.equal((renewalWorkflow.match(/CLOUDFLARE_BILLING_READ_TOKEN:\s*\$\{\{ secrets\.CLOUDFLARE_BILLING_READ_TOKEN \}\}/g) ?? []).length, 1,
    "deployment and dedicated renewal workflows must each receive the billing read token");
  assert.match(renewalWorkflow, /PROVIDER_REFRESH_SECRET:\s*\$\{\{ secrets\.PROVIDER_REFRESH_SECRET \}\}/);
  assert.match(workflow, /CLOUDFLARE_ACCOUNT_ID:\s*\$\{\{ secrets\.CLOUDFLARE_ACCOUNT_ID \}\}/);
  assert.match(workflow, /CLOUDFLARE_ACCESS_CLIENT_ID:\s*\$\{\{ secrets\.CLOUDFLARE_ACCESS_CLIENT_ID \}\}/);
  assert.match(workflow, /CLOUDFLARE_ACCESS_CLIENT_SECRET:\s*\$\{\{ secrets\.CLOUDFLARE_ACCESS_CLIENT_SECRET \}\}/);
  assert.match(workflow, /ZERO_CREDIT_PROVIDER_TOKEN:\s*\$\{\{ secrets\.ZERO_CREDIT_PROVIDER_TOKEN \}\}/);
  assert.match(workflow, /PROVIDER_REFRESH_SECRET:\s*\$\{\{ secrets\.PROVIDER_REFRESH_SECRET \}\}/);
  assert.doesNotMatch(workflow, /TELEMETRY_STREAM_TOKEN:\s*\$\{\{ secrets\.TELEMETRY_STREAM_TOKEN \}\}/);
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
  assert.doesNotMatch(workflow, /secret put TELEMETRY_STREAM_TOKEN/);
  assert.match(workflow, /provider-admitted/);
  assert.equal(
    workflow.match(/JSON\.stringify\(body\.diagnostics \?\? null\)/g)?.length,
    1,
    "deployment admission failures must surface the sanitized admission matrix",
  );
});

test("scheduled provider renewal is isolated from deployment publication", async () => {
  const [workflow, renewalWorkflow] = await Promise.all([
    readFile(workflowPath, "utf8"),
    readFile(renewalWorkflowPath, "utf8"),
  ]);
  assert.match(workflow, /group:\s*mahoraga-cloudflare-execution-runtime-deploy/);
  assert.match(workflow, /cancel-in-progress:\s*false/);
  assert.doesNotMatch(workflow, /schedule:/);
  assert.doesNotMatch(workflow, /renew-provider-admission:/);
  assert.doesNotMatch(renewalWorkflow, /schedule:|cron:/, "routine renewal is edge-native; the Actions workflow is break-glass only");
  assert.match(renewalWorkflow, /workflow_dispatch:/);
  assert.match(renewalWorkflow, /group:\s*mahoraga-cloudflare-provider-renewal/);
  assert.match(renewalWorkflow, /cancel-in-progress:\s*true/);
  assert.match(renewalWorkflow, /github\.actor == github\.repository_owner/);
  assert.match(renewalWorkflow, /github\.ref == 'refs\/heads\/main'/);
});

test("Cloudflare billing proof renews externally before expiry without redeploying Workers", async () => {
  const [workflow, runtimeWorker, runtimeWrangler] = await Promise.all([
    readFile(renewalWorkflowPath, "utf8"),
    readFile(runtimeWorkerPath, "utf8"),
    readFile(runtimeWranglerPath, "utf8"),
  ]);
  assert.doesNotMatch(workflow, /schedule:|cron:/);
  const renewalJob = workflow.indexOf("renew-provider-admission:");
  const renewalBlock = workflow.slice(renewalJob);
  const billingProof = workflow.indexOf("cloudflare-zero-credit-attestation.mjs", renewalJob);
  const refreshCall = workflow.indexOf("/api/provider/refresh", renewalJob);
  assert.ok(renewalJob >= 0, "dedicated quarter-hour external renewal check must exist");
  assert.ok(billingProof > renewalJob, "renewal must re-prove account billing");
  assert.ok(refreshCall > billingProof, "fresh attestation must be submitted only after billing proof");
  assert.match(workflow, /RENEWAL_MARGIN_MS:\s*1800000/);
  assert.match(renewalBlock, /timeout-minutes:\s*10/);
  assert.doesNotMatch(renewalBlock, /WATCHDOG_INTERVAL_MS|WATCHDOG_DURATION_MS|cloudflare-provider-renewal-watchdog\.mjs/);
  assert.match(workflow, /name:\s*Inspect current provider freshness margin/);
  assert.match(workflow, /id:\s*freshness/);
  assert.match(workflow, /\/api\/runtime\/attestation/);
  assert.match(workflow, /provider-freshness-sufficient/);
  assert.equal(
    (workflow.match(/if:\s*steps\.freshness\.outputs\.renewal_required == 'true'/g) ?? []).length,
    2,
    "billing proof and provider refresh must be skipped while sufficient freshness margin remains",
  );
  assert.match(renewalBlock, /billingAttestation/);
  assert.doesNotMatch(renewalBlock, /wrangler@[^\n]* deploy|cloudflare-execution-runtime\.ts deploy|cloudflare:owner-gateway:deploy/);
  assert.match(runtimeWorker, /provider-refresh-attestation-invalid/);
  assert.match(runtimeWrangler, /"crons"\s*:\s*\["\*\/5 \* \* \* \*"\]/);
  const schedule = runtimeWorker.slice(runtimeWorker.indexOf('  async scheduled('), runtimeWorker.indexOf('  async fetch(request: Request, env: Env)'));
  assert.match(schedule, /await env\.EXECUTION_DO\.getByName\("execution-v1"\)\.ensureInternalActivity\(\)/);
  assert.doesNotMatch(schedule, /fetch\(|probeZeroCreditProvider|invokeZeroCreditProvider|providerStateFromProbe|billingAttestation/);
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


test("exact-main deploy provisions edge-native owner-gateway renewal credentials", async () => {
  const workflow = await readFile(workflowPath, "utf8");
  assert.match(workflow, /OWNER_GATEWAY_SECRETS_FILE=.*mahoraga-owner-gateway-renewal-secrets\.json/);
  assert.match(workflow, /JSON\.stringify\(\{[\s\S]*PROVIDER_REFRESH_SECRET: refreshSecret,[\s\S]*CLOUDFLARE_ACCOUNT_ID:[\s\S]*CLOUDFLARE_API_TOKEN:[\s\S]*CLOUDFLARE_BILLING_READ_TOKEN:/);
  assert.match(workflow, /wrangler@4\.132\.0 deploy[\s\S]*cloudflare-owner-gateway\/wrangler\.toml[\s\S]*--secrets-file "\$OWNER_GATEWAY_SECRETS_FILE"/);
});

test("Cloudflare exact-main workflow promotes dependencies inside-out before the owner gateway", async () => {
  const workflow = await readFile(workflowPath, "utf8");
  const gatewayDeploy = workflow.indexOf("Deploy exact verified owner gateway");
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
  assert.match(workflow, /OWNER_GATEWAY_SECRETS_FILE=.*mahoraga-owner-gateway-renewal-secrets\.json/);
  assert.match(workflow, /BILLING_ATTESTATION_FILE=.*mahoraga-zero-credit-billing-attestation\.json/);
  assert.match(workflow, /GITHUB_ENV/);
  assert.match(workflow, /name:\s*Remove temporary Cloudflare secret files/);
  assert.match(workflow, /if:\s*always\(\)/);
  assert.match(workflow, /rm -f "\$PROVIDER_SECRETS_FILE" "\$RUNTIME_SECRETS_FILE" "\$OWNER_GATEWAY_SECRETS_FILE" "\$BILLING_ATTESTATION_FILE"/);
});


test("execution runtime is service-bound to the universal execution broker", async () => {
  const config = await readFile(runtimeWranglerPath, "utf8");
  assert.match(config, /"binding":\s*"MAHORAGA_EXECUTION_BROKER"/);
  assert.match(config, /"service":\s*"mahoraga-execution-broker"/);
  assert.doesNotMatch(config, /railway|vercel/i);
});

test("execution runtime bridges owner-authenticated execute actions to the universal broker", async () => {
  const runtimeWorker = await readFile(runtimeWorkerPath, "utf8");
  assert.match(runtimeWorker, /input\?\.type === "execute"/);
  assert.match(runtimeWorker, /MAHORAGA_EXECUTION_BROKER/);
  assert.match(runtimeWorker, /mahoraga-execution-broker\/api\/execute/);
});


test("universal execution broker is private and deploys before execution runtime", async () => {
  const [workflow, brokerConfig] = await Promise.all([
    readFile(workflowPath, "utf8"),
    readFile(path.join(root, "deploy/cloudflare-execution-broker/wrangler.jsonc"), "utf8"),
  ]);
  const brokerDeploy = workflow.indexOf("cloudflare:execution-broker:deploy");
  const runtimeDeploy = workflow.indexOf("cloudflare-execution-runtime.ts deploy");
  assert.ok(brokerDeploy >= 0 && runtimeDeploy > brokerDeploy);
  assert.match(brokerConfig, /"workers_dev"\s*:\s*false/);
  assert.match(brokerConfig, /"preview_urls"\s*:\s*false/);
  assert.doesNotMatch(brokerConfig, /"routes?"\s*:/);
});


test("Cloudflare publication requires a trusted receipt for bot dispatch and retains owner manual authority", async () => {
 const workflow = await readFile(workflowPath, 'utf8');
 const lane = workflow.slice(workflow.indexOf('  deploy-accept:'), workflow.indexOf('    runs-on:'));
 for (const guard of ["github.actor == github.repository_owner", "github.ref == 'refs/heads/main'", "github.repository == 'michaeljwilliams0123/mahoraga'", "head_repository.full_name == github.repository", "path == '.github/workflows/verify.yml'", "status == 'completed'", "actor.login == 'github-actions[bot]'", "event == 'push'", "event == 'workflow_dispatch'"]) assert.ok(lane.includes(guard));
 assert.match(workflow, /actions:\s*read/);
 assert.match(workflow, /name:\s*Fetch trusted bot publication receipt/);
 assert.match(workflow, /verified-main-publication-\$VERIFIED_SHA/);
 assert.match(workflow, /VERIFIED_MAIN_PUBLICATION_RECEIPT=/);
 const fetchReceipt = workflow.indexOf('Fetch trusted bot publication receipt');
 const validateReceipt = workflow.indexOf('run: node scripts/verified-main-publication.ts');
 const exact = workflow.indexOf('run: node scripts/verify-exact-head.mjs');
 const billing = workflow.indexOf('cloudflare-zero-credit-attestation.mjs');
 assert.ok(fetchReceipt >= 0 && fetchReceipt < validateReceipt && validateReceipt < exact && exact < billing);
});
