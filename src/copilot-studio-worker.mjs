import { loadCopilotStudioRuntimeSettings, createCopilotTokenProvider } from "./copilot-studio-auth.mjs";
import { invokeCopilotStudioAgent } from "./copilot-studio-client.mjs";
import { probePowerPlatformProvider } from "./power-platform-provider.mjs";
import { isZeroMarginalCreditEligible, microsoftBillingAttestationFromEnv, resolveMicrosoftBillingClass } from "./microsoft-usage-cost.mjs";

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

  throw safeError("unsupported-capability");
}

function safeError(code) { return Object.assign(new Error(code), { code }); }
