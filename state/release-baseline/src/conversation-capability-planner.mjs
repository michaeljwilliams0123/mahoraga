import { classifyTaskIntent } from "./task-intent.mjs";

const RECOVERABLE_ROUTE_REASONS = new Set([
  "canary-stale", "canary-never-run", "provider-unavailable", "provider-degraded", "provider-unknown",
  "routing-evidence-missing", "process-starting", "process-stale", "process-stopped", "process-crashed",
]);
const FOLLOW_UP = /\b(?:above|that|those|previous|prior|earlier|same|continue|now compare|summarize it|summarize the above)\b/i;
const MICROSOFT = /\b(?:microsoft\s*365|m365|outlook|sharepoint|one\s*drive|onedrive|teams|excel|word|powerpoint|copilot)\b/i;
const REPOSITORY = /\b(?:repo|repository|codebase|github|source code)\b/i;
const MUTATION = /\b(?:apply|build|change|create|delete|deploy|execute|fix|implement|install|modify|publish|repair|update|write)\b/i;
const VERIFY = /\b(?:verify|validate|test|check)\b/i;
const COMMUNICATION = /\b(?:send|message|ping|email|notify|post|broadcast)\b/i;
const BROAD_RECIPIENT = /\b(?:everyone|everybody|all users|all people|whole (?:team|department|company)|entire (?:team|department|company)|channel|coworkers|colleagues)\b/i;

export function planConversationCapabilities({ content = "", attachmentCount = 0, capabilityRoutes = [], priorTasks = [] } = {}) {
  const text = normalizeText(content);
  const routes = normalizeRoutes(capabilityRoutes);
  const capabilities = [...new Set(routes.filter(plannableRoute).map((route) => route.capability))];
  if (COMMUNICATION.test(text) && BROAD_RECIPIENT.test(text)) return decision("unavailable", null, [], "recipient-restricted", "recipient-not-authorized", false);

  const base = classifyTaskIntent({ content: text, attachmentCount, availableCapabilities: capabilities });
  const planned = [];
  const add = (capability) => { if (capability && canPlan(routes, capability) && !planned.includes(capability)) planned.push(capability); };

  if (attachmentCount > 0 && base.capability) add(base.capability);
  if (REPOSITORY.test(text)) add("repository.inspect");
  if (MICROSOFT.test(text) && !MUTATION.test(text)) add("m365.reason");

  if (MUTATION.test(text) && REPOSITORY.test(text)) {
    add("codex.execute");
    if (VERIFY.test(text) || canPlan(routes, "repository.verify")) add("repository.verify");
  }

  if (planned.length === 0 && FOLLOW_UP.test(text)) {
    const prior = normalizePriorTasks(priorTasks);
    const enterprise = prior.some((task) => task.dataClass === "enterprise");
    if (enterprise) add("m365.reason");
    if (planned.length === 0) {
      const priorReadable = [...prior].reverse().find((task) => readableCapability(task.capability) && canPlan(routes, task.capability));
      if (priorReadable) add(priorReadable.capability);
    }
    if (planned.length === 0) add("assistant.respond");
    if (planned.length > 0) {
      const reason = enterprise && planned[0] === "m365.reason" ? "ucf-enterprise-follow-up" : "ucf-context-follow-up";
      return finalizePlan(planned, routes, reason);
    }
  }

  if (planned.length > 1) return finalizePlan(planned, routes, "ucf-composed-objective");
  if (planned.length === 1) {
    const reason = planned[0] === "m365.reason" && MICROSOFT.test(text) ? "ucf-microsoft-context" : base.reasonCode;
    return finalizePlan(planned, routes, reason);
  }

  if (base.capability && base.capability !== "provider.gap") {
    add(base.capability);
    if (planned.length > 0) return finalizePlan(planned, routes, base.reasonCode);
  }

  if (MUTATION.test(text)) {
    add("codex.execute");
    if (planned.includes("codex.execute")) add("repository.verify");
    if (planned.length > 0) return finalizePlan(planned, routes, "ucf-capability-gap-builder");
  }

  add("assistant.respond");
  if (planned.length > 0) return finalizePlan(planned, routes, "ucf-general-answer");
  return decision("unavailable", null, [], "unsupported", base.reasonCode ?? "no-plannable-capability", false);
}

function finalizePlan(capabilityPlan, routes, reasonCode) {
  const recoverableRoute = capabilityPlan.some((capability) => {
    const route = bestRoute(routes, capability);
    return route && route.routable !== true && RECOVERABLE_ROUTE_REASONS.has(route.routingReason);
  });
  const execution = capabilityPlan.length > 1 ? "objective" : "task";
  const capability = execution === "task" ? capabilityPlan[0] : null;
  return decision(execution, capability, capabilityPlan, capabilityPlan.length > 1 ? "composed-capabilities" : intentKind(capability), reasonCode, recoverableRoute);
}

function decision(execution, capability, capabilityPlan, intentKindValue, reasonCode, recoverableRoute) {
  return deepFreeze({
    schemaVersion: 1,
    execution,
    capability,
    capabilityPlan: [...capabilityPlan],
    intentKind: intentKindValue,
    reasonCode,
    recoverableRoute,
  });
}

function normalizeRoutes(value) {
  if (!Array.isArray(value)) throw new TypeError("conversation-capability-routes-invalid");
  return value.filter((item) => item && typeof item === "object" && !Array.isArray(item) && typeof item.capability === "string")
    .map((item) => ({
      capability: item.capability,
      workerId: typeof item.workerId === "string" ? item.workerId : null,
      enabled: item.enabled !== false,
      routable: item.routable === true,
      routingReason: typeof item.routingReason === "string" ? item.routingReason : null,
      dataClasses: Array.isArray(item.dataClasses) ? [...item.dataClasses] : [],
      economicTier: Number.isSafeInteger(item.economicTier) ? item.economicTier : 8,
    }));
}

function plannableRoute(route) {
  return route.enabled && (route.routable || RECOVERABLE_ROUTE_REASONS.has(route.routingReason));
}

function canPlan(routes, capability) {
  return routes.some((route) => route.capability === capability && plannableRoute(route));
}

function bestRoute(routes, capability) {
  return routes.filter((route) => route.capability === capability && route.enabled)
    .sort((left, right) => Number(right.routable) - Number(left.routable) || left.economicTier - right.economicTier)[0] ?? null;
}

function normalizePriorTasks(value) {
  if (!Array.isArray(value)) return [];
  return value.filter((item) => item && typeof item === "object" && typeof item.capability === "string")
    .map((item) => ({ capability: item.capability, dataClass: item.dataClass ?? "synthetic" }));
}

function readableCapability(capability) {
  return /\.(?:respond|reason|inspect|status|health|observe|scan|validate)$/.test(capability);
}

function intentKind(capability) {
  if (capability === "assistant.respond") return "answer";
  if (capability?.startsWith("m365.")) return "microsoft-work";
  if (capability?.startsWith("repository.")) return "repository-inspect";
  if (capability?.startsWith("artifact.")) return "attachment";
  return "ucf-capability";
}

function normalizeText(value) {
  if (typeof value !== "string") throw new TypeError("conversation-content-invalid");
  return value.trim();
}

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}
