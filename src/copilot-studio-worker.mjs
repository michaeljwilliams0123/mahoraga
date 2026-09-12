import { loadCopilotStudioRuntimeSettings, createCopilotTokenProvider } from "./copilot-studio-auth.mjs";
import { invokeCopilotStudioAgent } from "./copilot-studio-client.mjs";
import { executeCopilotStudioPacSync } from "./copilot-studio-pac-sync.mjs";
import { probePowerPlatformProvider } from "./power-platform-provider.mjs";
import { isZeroMarginalCreditEligible, microsoftBillingAttestationFromEnv, resolveMicrosoftBillingClass } from "./microsoft-usage-cost.mjs";

const STUDIO_ALIASES = new Set(["general-mahoraga", "enterprise-core", "tenant-health-reader"]);
const CONFIGURE_SURFACES = new Set(["instructions", "connected-agents", "evaluate", "knowledge", "memory", "model", "monitor", "skills", "tools"]);
const CONFIGURE_REASONS = new Set([
  "capability-missing", "connected-agent-missing", "evaluation-failing", "evaluation-stale", "knowledge-missing",
  "memory-required", "model-not-production", "monitoring-below-threshold", "monitoring-stale", "skill-missing", "tool-missing",
]);

export async function executeCopilotStudioCapability(capability, task = {}, worker = {}, dependencies = {}) {
  const env = dependencies.env ?? process.env;
  const loadRuntimeSettings = dependencies.loadRuntimeSettings ?? loadCopilotStudioRuntimeSettings;
  const createTokenProvider = dependencies.createTokenProvider ?? createCopilotTokenProvider;
  const invokeAgent = dependencies.invokeAgent ?? invokeCopilotStudioAgent;
  const probe = dependencies.probePowerPlatformProvider ?? probePowerPlatformProvider;
  const declared = worker.billingClassByCapability?.[capability] ?? "unknown";
  const runtimeAttestation = microsoftBillingAttestationFromEnv(env)?.["copilot-studio"]?.[capability] ?? null;
  const billingClass = resolveMicrosoftBillingClass(capability, declared, runtimeAttestation);
  const delegateAttestation = microsoftBillingAttestationFromEnv(env)?.["copilot-studio"]?.["studio.delegate"] ?? null;
  const delegateBillingClass = resolveMicrosoftBillingClass("studio.delegate", worker.billingClassByCapability?.["studio.delegate"] ?? "unknown", delegateAttestation);

  if (capability === "studio.health") {
    const provider = await probe(dependencies.providerDependencies ?? {});
    let runtimeBindingPresent = false;
    try { loadRuntimeSettings(env); runtimeBindingPresent = true; } catch {}
    const managementPlaneReady = provider?.verified === true;
    const delegationRuntimeReady = runtimeBindingPresent;
    const verified = managementPlaneReady && delegationRuntimeReady;
    const summary = verified
      ? "Copilot Studio management plane and delegation runtime are ready."
      : managementPlaneReady
        ? "Copilot Studio management plane is ready; delegation runtime binding is unavailable."
        : "Copilot Studio management plane is unavailable.";
    return Object.freeze({
      verified,
      summary,
      providerHealth: Object.freeze({
        authenticated: provider?.providerHealth?.authenticated === true,
        managementPlaneReady,
        delegationRuntimeReady,
        runtimeBindingPresent,
        platformAuthorityScopes: Object.freeze(verified ? ["connector.invoke", "copilot.invoke"] : []),
        usageBillingClass: billingClass,
        delegateBillingClass,
        zeroCreditEligible: isZeroMarginalCreditEligible(billingClass),
      }),
    });
  }

  if (capability === "studio.delegate") {
    if (!isZeroMarginalCreditEligible(billingClass)) throw safeError("billing-not-zero-credit");
    const settings = loadRuntimeSettings(env);
    const tokenProvider = dependencies.tokenProvider ?? createTokenProvider(settings, dependencies.authDependencies ?? {});
    return invokeAgent({
      role: task.studioRole ?? "reasoner",
      prompt: task.requestedOutcome,
      idempotencyKey: task.idempotencyKey ?? task.id,
    }, { env, tokenProvider, CopilotStudioClientCtor: dependencies.CopilotStudioClientCtor, now: dependencies.now });
  }

  if (capability === "studio.configure") {
    if (!isZeroMarginalCreditEligible(billingClass)) throw safeError("billing-not-zero-credit");
    const request = normalizeConfigureRequest(task);
    const configureAgent = dependencies.configureAgent ?? executeCopilotStudioPacSync;
    const configured = await configureAgent(request, { env, ...(dependencies.configureDependencies ?? {}) });
    if (configured?.verified !== true) throw safeError("studio-configure-verification-failed");
    const phases = normalizePhases(configured.phases);
    const published = request.publish && phases.includes("publish");
    if (request.publish !== published) throw safeError("studio-configure-verification-failed");
    const evaluation = normalizeEvaluation(configured.evaluation, request.publish);
    return Object.freeze({
      verified: true,
      summary: `Copilot Studio configuration verified for ${request.alias} across ${request.surfaces.length} bounded surface(s).`,
      providerReceipt: Object.freeze({
        alias: request.alias,
        reasonCodes: request.reasonCodes,
        surfaces: request.surfaces,
        phases,
        published,
        ...(evaluation ? { evaluation } : {}),
      }),
    });
  }

  throw safeError("unsupported-capability");
}

function normalizeConfigureRequest(task) {
  let value;
  try { value = JSON.parse(String(task?.requestedOutcome ?? "")); } catch { throw safeError("studio-configure-request-invalid"); }
  if (!value || typeof value !== "object" || Array.isArray(value)) throw safeError("studio-configure-request-invalid");
  const keys = Object.keys(value).sort();
  if (keys.join(",") !== "alias,publish,reasonCodes,surfaces") throw safeError("studio-configure-request-invalid");
  const alias = String(value.alias ?? "");
  if (!STUDIO_ALIASES.has(alias)) throw safeError("studio-configure-request-invalid");
  const reasonCodes = normalizeTokenArray(value.reasonCodes, CONFIGURE_REASONS);
  const surfaces = normalizeTokenArray(value.surfaces, CONFIGURE_SURFACES);
  if (reasonCodes.length < 1 || surfaces.length < 1 || typeof value.publish !== "boolean") throw safeError("studio-configure-request-invalid");
  const idempotencyKey = String(task?.idempotencyKey ?? task?.id ?? "");
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/.test(idempotencyKey)) throw safeError("studio-configure-request-invalid");
  return Object.freeze({ alias, reasonCodes, surfaces, publish: value.publish, idempotencyKey });
}

function normalizeTokenArray(value, allowed) {
  if (!Array.isArray(value) || value.length > 16 || new Set(value).size !== value.length) throw safeError("studio-configure-request-invalid");
  const result = value.map((item) => String(item));
  if (result.some((item) => !allowed.has(item))) throw safeError("studio-configure-request-invalid");
  return Object.freeze(result.sort());
}

function normalizePhases(value) {
  const allowed = new Set(["pull", "validate", "push", "evaluate", "publish"]);
  if (!Array.isArray(value) || value.length < 1 || value.length > 5 || new Set(value).size !== value.length) throw safeError("studio-configure-verification-failed");
  if (value.some((item) => !allowed.has(item))) throw safeError("studio-configure-verification-failed");
  if (!value.includes("pull") || !value.includes("validate") || !value.includes("push")) throw safeError("studio-configure-verification-failed");
  if (value.includes("publish") && (!value.includes("evaluate") || value.indexOf("evaluate") > value.indexOf("publish"))) throw safeError("studio-configure-verification-failed");
  return Object.freeze([...value]);
}

function normalizeEvaluation(value, required) {
  if (!required && value === undefined) return null;
  if (!value || value.state !== "passing" || !Number.isInteger(value.scoreBasisPoints) || value.scoreBasisPoints < 0 || value.scoreBasisPoints > 10000) throw safeError("studio-configure-verification-failed");
  return Object.freeze({ state: "passing", scoreBasisPoints: value.scoreBasisPoints });
}

function safeError(code) { return Object.assign(new Error(code), { code }); }
