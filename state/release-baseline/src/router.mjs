import { buildCapabilityRegistry, rankCapabilityRoutes } from "./capability-registry.mjs";
import { resolveEffectiveAuthority } from "./owner-authority.mjs";
import { selectZeroCreditProvider } from "./zero-credit-provider-selector.mjs";
import { classifyAutonomyProvider, isCreditFreeWorkerId, selectCreditFreeExecutionPlane } from "./credit-free-autonomy.mjs";

export const routeTask = createTaskRouter();

export function createTaskRouter({ rankRoutes = rankCapabilityRoutes } = {}) {
  return function routeTask(manifest, task, context = {}) {
    const creditFreeDecision = creditFreeGate(task, context);
    if (creditFreeDecision && !creditFreeDecision.ok) {
      return { status: "waiting", reason: creditFreeDecision.reason, worker: null, creditFreeDecision };
    }
    const providerDecision = zeroCreditDecision(task, context);
    if (providerDecision?.status === "waiting") return { status: "waiting", reason: providerDecision.providerId, worker: null, providerDecision };
    const ranked = rankRoutes(manifest, task, context);
    const candidates = ranked.candidates
      .filter((candidate) => !task.excludedWorkerIds?.includes(candidate.workerId))
      .filter((candidate) => !providerDecision || candidate.costClass === providerDecision.costClass)
      .filter((candidate) => !creditFreeDecision || isCreditFreeWorkerId(candidate.workerId) || (classifyAutonomyProvider(candidate.workerId) === "local-reasoner" && context.localReasonerReady === true));
    const reason = ranked.reason ?? (ranked.candidates.length > 0 ? "worker-excluded" : "routing-evidence-missing");
    if (candidates.length === 0) return { status: "waiting", reason, worker: null, ...(creditFreeDecision ? { creditFreeDecision } : {}) };
    const selected = candidates[0];
    const authorityDecision = task.authorityScope ? resolveEffectiveAuthority({
      grant: manifest.ownerAuthority,
      requestedScope: task.authorityScope,
      requestedTarget: task.authorityTarget ?? null,
      platformScopes: context.platformAuthorityScopesByWorkerId?.[selected.workerId] ?? [],
      capabilityScopes: selected.authorityScopes ?? [],
    }) : null;
    if (authorityDecision && !authorityDecision.authorized) return { status: "waiting", reason: authorityDecision.reason, worker: null, authorityDecision };
    if (authorityDecision?.confirmationRequired) return { status: "waiting", reason: "owner-confirmation-required", worker: null, authorityDecision };
    const route = {
      status: "routable",
      reason: null,
      worker: resolveWorker(manifest, selected),
      decision: selected,
      alternates: candidates.slice(1),
      ...(authorityDecision ? { authorityDecision } : {}),
    };
    const withProvider = providerDecision ? { ...route, providerDecision } : route;
    return creditFreeDecision ? { ...withProvider, creditFreeDecision } : withProvider;
  };
}

export function capabilityIndex(manifest, workerStates = [], now = Date.now(), context = {}) {
  return buildCapabilityRegistry(manifest, workerStates, now, context);
}

function creditFreeGate(task, context) {
  if (context.creditFreeRequired !== true && task?.creditFreeRequired !== true && context.providerPolicy !== "credit-free") return null;
  return selectCreditFreeExecutionPlane({
    requestedProvider: task.provider ?? task.requestedProvider ?? "repository",
    spendGrantUsd: context.spendGrantUsd ?? 0,
    platformApiKeyPresent: context.platformApiKeyPresent === true,
    allowPaidFallback: context.allowPaidFallback === true,
    localReasonerReady: context.localReasonerReady === true,
  });
}

function zeroCreditDecision(task, context) {
  return context.providerPolicy === "zero-credit" && isAutonomySelfUpgrade(task) ? selectZeroCreditProvider(context) : null;
}

function isAutonomySelfUpgrade(task) {
  return typeof task.capability === "string" && (task.capability.startsWith("autonomy.") || task.capability.startsWith("self-upgrade."));
}

function resolveWorker(manifest, selected) {
  const declared = manifest.workers.find((worker) => worker.id === selected.workerId);
  if (declared) return declared;
  return {
    id: selected.workerId,
    label: selected.workerLabel,
    enabled: true,
    costClass: selected.costClass,
    dataClasses: [...selected.dataClasses],
    capabilities: [selected.capability],
    executionPlane: selected.executionPlane,
    routing: {
      interfaceType: selected.interfaceType,
      permissionClass: selected.permissionClass,
      reliability: selected.reliability,
      requiresAttendedDesktop: selected.requiresAttendedDesktop,
      executionType: selected.executionType,
      latencyMs: selected.latencyMs,
      maximumWorkload: selected.maximumWorkload,
      fallbackWorkerIds: [...selected.fallbackWorkerIds],
    },
  };
}
