import { buildCapabilityRegistry, rankCapabilityRoutes } from "./capability-registry.mjs";
import { resolveCapabilityAuthority } from "./owner-authority.mjs";
import { planCapabilityRecovery } from "./capability-recovery.mjs";
import { selectZeroCreditProvider } from "./zero-credit-provider-selector.mjs";
import { classifyAutonomyProvider, isCreditFreeWorkerId, selectCreditFreeExecutionPlane } from "./credit-free-autonomy.mjs";
import { isZeroMarginalCreditEligible } from "./resource-economy.mjs";
import { createAuthorityDecision } from "./authority-decision.mjs";

export const routeTask = createTaskRouter();

export function createTaskRouter({ rankRoutes = rankCapabilityRoutes } = {}) {
  return function routeTask(manifest, task, context = {}) {
    const ownerGrant = manifest.ownerAuthority ?? null;
    const creditFreeDecision = creditFreeGate(task, context);
    if (creditFreeDecision && !creditFreeDecision.ok) {
      const authorityDecision = createAuthorityDecision({
        ownerGrant, task, creditFreeDecision, context, legacyReason: creditFreeDecision.reason,
      });
      return waitingWithRecovery(creditFreeDecision.reason, task, null, { creditFreeDecision, authorityDecision });
    }

    const providerDecision = zeroCreditDecision(task, context);
    if (providerDecision?.status === "waiting") {
      const authorityDecision = createAuthorityDecision({
        ownerGrant, task, providerDecision, creditFreeDecision, context,
        legacyReason: providerDecision.providerId ?? "provider-unavailable",
      });
      return waitingWithRecovery(providerDecision.providerId, task, null, { providerDecision, authorityDecision });
    }

    const ranked = rankRoutes(manifest, task, context);
    const zeroMarginalRequired = context.providerPolicy === "zero-credit"
      || context.providerPolicy === "credit-free"
      || context.creditFreeRequired === true
      || task?.creditFreeRequired === true
      || task?.requestedMode === "zero-credit";
    const normalizedCandidates = ranked.candidates.map(normalizeCandidateBilling);
    const preBillingCandidates = normalizedCandidates
      .filter((candidate) => !task.excludedWorkerIds?.includes(candidate.workerId))
      .filter((candidate) => !providerDecision || candidate.costClass === providerDecision.costClass)
      .filter((candidate) => !creditFreeDecision || isCreditFreeWorkerId(candidate.workerId) || zeroMarginalEligible(candidate, context) || (classifyAutonomyProvider(candidate.workerId) === "local-reasoner" && context.localReasonerReady === true));
    const candidates = zeroMarginalRequired ? preBillingCandidates.filter((candidate) => zeroMarginalEligible(candidate, context)) : preBillingCandidates;

    if (preBillingCandidates.length > 0 && candidates.length === 0 && zeroMarginalRequired) {
      const billingDecision = Object.freeze({ required: true, effectiveClass: preBillingCandidates[0].billingClass, eligible: false });
      const authorityDecision = createAuthorityDecision({
        ownerGrant, task, candidate: preBillingCandidates[0], providerDecision, creditFreeDecision,
        billingDecision, context, legacyReason: "billing-not-zero-credit",
      });
      return waitingWithRecovery("billing-not-zero-credit", task, ranked, {
        billingDecision, authorityDecision,
        ...(providerDecision ? { providerDecision } : {}),
        ...(creditFreeDecision ? { creditFreeDecision } : {}),
      });
    }

    const reason = ranked.reason ?? (normalizedCandidates.length > 0 ? "worker-excluded" : "routing-evidence-missing");
    if (candidates.length === 0) {
      const authorityDecision = createAuthorityDecision({
        ownerGrant, task, providerDecision, creditFreeDecision, context, legacyReason: reason,
      });
      return waitingWithRecovery(reason, task, ranked, {
        authorityDecision,
        ...(providerDecision ? { providerDecision } : {}),
        ...(creditFreeDecision ? { creditFreeDecision } : {}),
      });
    }

    const selected = candidates[0];
    const capabilityAuthorityScopes = selected.authorityScopes ?? [];
    const ownerDecision = task.authorityScope || capabilityAuthorityScopes.length > 0 ? resolveCapabilityAuthority({
      grant: ownerGrant,
      requestedScope: task.authorityScope ?? null,
      requestedTarget: task.authorityTarget ?? null,
      platformScopes: context.platformAuthorityScopesByWorkerId?.[selected.workerId] ?? selected.platformAuthorityScopes ?? [],
      capabilityScopes: capabilityAuthorityScopes,
    }) : null;
    const billingDecision = Object.freeze({
      required: zeroMarginalRequired,
      effectiveClass: selected.billingClass,
      eligible: zeroMarginalEligible(selected, context),
    });
    const authorityDecision = createAuthorityDecision({
      ownerGrant, task, candidate: selected, ownerDecision, providerDecision, creditFreeDecision,
      billingDecision, context,
    });

    if (authorityDecision.decision !== "allow") {
      const authorityReason = ownerDecision?.authorized === false
        ? ownerDecision.reason
        : ownerDecision?.confirmationRequired === true
          ? "owner-confirmation-required"
          : authorityDecision.reasonCodes[0] ?? "authority-hold";
      return waitingWithRecovery(authorityReason, task, ranked, {
        authorityDecision, billingDecision,
        ...(providerDecision ? { providerDecision } : {}),
        ...(creditFreeDecision ? { creditFreeDecision } : {}),
      });
    }

    const route = {
      status: "routable",
      reason: null,
      worker: resolveWorker(manifest, selected),
      decision: selected,
      alternates: candidates.slice(1),
      billingDecision,
      authorityDecision,
    };
    const withProvider = providerDecision ? { ...route, providerDecision } : route;
    return creditFreeDecision ? { ...withProvider, creditFreeDecision } : withProvider;
  };
}

function waitingWithRecovery(reason, task, ranked, extra = {}) {
  const recoveryPlan = planCapabilityRecovery({
    reason,
    task,
    consideredRoutes: ranked?.considered ?? [],
    excludedWorkerIds: task.excludedWorkerIds ?? [],
  });
  return {
    status: "waiting",
    reason,
    worker: null,
    ...(recoveryPlan.recoverable ? { recoveryPlan } : {}),
    ...extra,
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

function zeroMarginalEligible(candidate, context) {
  return isZeroMarginalCreditEligible(
    candidate.billingClass,
    resourceEconomyAttestationFor(context, candidate),
    Number.isFinite(context.now) ? context.now : Date.now(),
  );
}

function resourceEconomyAttestationFor(context, candidate) {
  return context.resourceEconomyAttestationByWorkerId?.[candidate.workerId]?.[candidate.capability] ?? null;
}

function normalizeCandidateBilling(candidate) {
  if (candidate.billingClass) return candidate;
  const billingClass = defaultBillingClass(candidate.costClass);
  return { ...candidate, billingClass };
}

function defaultBillingClass(costClass) {
  if (costClass === "deterministic" || costClass === "local-model") return "deterministic-zero";
  if (costClass === "metered-cloud") return "metered";
  return "unknown";
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
