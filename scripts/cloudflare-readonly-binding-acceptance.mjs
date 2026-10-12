/**
 * Verify ACTUAL live Cloudflare service-binding metadata after broker deploy.
 * This tool cannot grant an action, provision a token, or assert owner receipt.
 * Opt-in checks run before the execution runtime or Owner Gateway is promoted.
 */
import { pathToFileURL } from "node:url";

const BROKER = "mahoraga-execution-broker";
const INSPECTOR = "mahoraga-cloudflare-readonly-inspector";
const PROVIDER_BINDINGS = new Set([
  "REPOSITORY_PROVIDER", "CLOUD_PROVIDER", "INTEGRATION_PROVIDER",
  "BROWSER_PROVIDER", "DESKTOP_PROVIDER", "CODEX_PROVIDER", "MEMORY_PROVIDER",
  "ARTIFACT_PROVIDER", "IMAGE_PROVIDER", "WORKSPACE_PROVIDER",
]);
const REQUIRED_SECRETS = ["CLOUDFLARE_AUDIT_TOKEN", "CLOUDFLARE_ACCOUNT_ID"];
const cloudId = (s) => typeof s === "string" && /^[a-zA-Z0-9-]{12,100}$/.test(s);
const record = (s) => s !== null && typeof s === "object" && !Array.isArray(s) ? s : null;

const assertSettings = (value, label) => {
  const wrapper = record(value);
  const settings = record(wrapper?.result);
  if (wrapper?.success !== true || !Array.isArray(settings?.bindings)) {
    throw new Error("readonly-binding-" + label + "-unverified");
  }
  return settings.bindings;
};
const assertDeployment = (value, label, nowMs) => {
  const wrapper = record(value), result = record(wrapper?.result);
  const item = record(Array.isArray(result?.deployments) ? result.deployments[0] : null);
  const versions = item?.versions;
  if (wrapper?.success !== true || !item || !cloudId(item.id)
      || typeof item.created_on !== "string" || !Number.isFinite(Date.parse(item.created_on))
      || Date.parse(item.created_on) > nowMs + 5000
      || !Array.isArray(versions) || versions.length !== 1 || !record(versions[0])
      || !cloudId(versions[0].version_id) || versions[0].percentage !== 100) {
    throw new Error("readonly-binding-" + label + "-deployment-unverified");
  }
  return Object.freeze({ deploymentId: item.id, versionId: versions[0].version_id });
};

/** Pure, mockable validation: never report binding merely from source configuration. */
export function verifyReadonlyBindingSnapshot({
  enabled, brokerSettings, brokerDeployments, inspectorSettings, inspectorDeployments, nowMs = Date.now(),
} = {}) {
  if (typeof enabled !== "boolean" || !Number.isSafeInteger(nowMs)) throw new Error("readonly-binding-mode-invalid");
  const bindings = assertSettings(brokerSettings, "broker");
  const services = bindings.filter(b => record(b)?.type === "service");
  const providerNames = services.map(b => b.name).filter(name => PROVIDER_BINDINGS.has(name));
  if (!enabled) {
    if (providerNames.length !== 0 || services.length !== 0) throw new Error("readonly-binding-unexpected-live-service");
    return Object.freeze({
      kind: "cloudflare-readonly-binding-readback", status: "disabled-unbound",
      providerBindingPresent: false, executableActionConfirmed: false,
    });
  }
  if (bindings.length !== 1 || services.length !== 1 || providerNames.length !== 1
      || services[0].name !== "CLOUD_PROVIDER" || services[0].service !== INSPECTOR
      || (services[0].environment !== undefined && services[0].environment !== "production")) {
    throw new Error("readonly-binding-cloud-provider-mismatch");
  }
  const inspectorBindings = assertSettings(inspectorSettings, "inspector");
  const secretNames = inspectorBindings.filter(b => record(b)?.type === "secret_text").map(b => b.name);
  if (inspectorBindings.length !== REQUIRED_SECRETS.length
      || REQUIRED_SECRETS.some(n => secretNames.filter(x => x === n).length !== 1)
      || inspectorBindings.some(b => record(b)?.type === "service")) {
    throw new Error("readonly-binding-inspector-credentials-unverified");
  }
  const brokerDeployment = assertDeployment(brokerDeployments, "broker", nowMs);
  const inspectorDeployment = assertDeployment(inspectorDeployments, "inspector", nowMs);
  return Object.freeze({
    kind: "cloudflare-readonly-binding-readback", status: "bound-for-runtime-attestation",
    binding: "CLOUD_PROVIDER", service: INSPECTOR, providerBindingPresent: true,
    brokerDeploymentId: brokerDeployment.deploymentId,
    inspectorDeploymentId: inspectorDeployment.deploymentId,
    inspectorVersionId: inspectorDeployment.versionId,
    trafficPercentage: 100, requiredSecretsPresent: true,
    executableActionConfirmed: false, ownerAuthorityGranted: false,
  });
}

export async function readReadonlyBindingSnapshot({
  accountId, apiToken, enabled, fetchImpl = fetch, nowMs = Date.now(),
} = {}) {
  if (!/^[a-f0-9]{32}$/.test(accountId ?? "")
      || typeof apiToken !== "string" || apiToken.trim().length < 32
      || typeof enabled !== "boolean") throw new Error("readonly-binding-readback-credentials-unavailable");
  async function get(name, suffix) {
    const url = "https://api.cloudflare.com/client/v4/accounts/" + accountId
      + "/workers/scripts/" + name + "/" + suffix;
    let response;
    try {
      response = await fetchImpl(url, {
        method: "GET", redirect: "error",
        headers: { authorization: "Bearer " + apiToken, accept: "application/json", "cache-control": "no-store" },
        signal: AbortSignal.timeout(8000),
      });
    } catch { throw new Error("readonly-binding-api-unavailable"); }
    if (!response.ok) throw new Error("readonly-binding-api-unavailable");
    try { return await response.json(); }
    catch { throw new Error("readonly-binding-api-invalid"); }
  }
  // Disabled mode must still verify the canonical broker has NO latent external bindings.
  const brokerSettings = await get(BROKER, "settings");
  if (!enabled) return verifyReadonlyBindingSnapshot({ enabled, brokerSettings, nowMs });
  const [brokerDeployments, inspectorSettings, inspectorDeployments] = await Promise.all([
    get(BROKER, "deployments"), get(INSPECTOR, "settings"), get(INSPECTOR, "deployments"),
  ]);
  return verifyReadonlyBindingSnapshot({
    enabled, brokerSettings, brokerDeployments, inspectorSettings, inspectorDeployments, nowMs,
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const flag = process.env.MAHORAGA_READONLY_PROVIDER_ENABLED ?? "";
    if (!["", "false", "true"].includes(flag)) throw new Error("readonly-binding-mode-invalid");
    const receipt = await readReadonlyBindingSnapshot({
      accountId: (process.env.CLOUDFLARE_ACCOUNT_ID ?? "").trim(),
      apiToken: (process.env.CLOUDFLARE_READONLY_AUDIT_TOKEN ?? "").trim(),
      enabled: flag === "true",
    });
    process.stdout.write(JSON.stringify(receipt) + "\n");
  } catch (error) {
    const allowed = new Set([
      "readonly-binding-mode-invalid", "readonly-binding-readback-credentials-unavailable",
      "readonly-binding-api-unavailable", "readonly-binding-api-invalid",
      "readonly-binding-broker-unverified", "readonly-binding-inspector-unverified",
      "readonly-binding-unexpected-live-service", "readonly-binding-cloud-provider-mismatch",
      "readonly-binding-inspector-credentials-unverified",
      "readonly-binding-broker-deployment-unverified", "readonly-binding-inspector-deployment-unverified",
    ]);
    const reason = error instanceof Error && allowed.has(error.message)
      ? error.message : "readonly-binding-readback-failed";
    process.stderr.write("::error::" + reason + "\n");
    process.exitCode = 1;
  }
}
