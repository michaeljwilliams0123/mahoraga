import { AUTONOMY_OBJECTIVE_AUTHORITY } from "./objective-release-authority.mjs";
import { CREDIT_FREE_GRAPH, assertCreditFreeDispatch, planCreditFreeWork } from "./credit-free-autonomy.mjs";

const MAX_MESSAGE_LENGTH = 800;

function boundedText(value, fallback) {
  const normalized = String(value ?? "").replace(/\s+/g, " ").trim();
  return (normalized || fallback).slice(0, MAX_MESSAGE_LENGTH);
}

function executionContract(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError("Autonomy execution contract is required.");
  const baseCommit = String(value.baseCommit ?? "").toLowerCase();
  if (!/^[a-f0-9]{40,64}$/.test(baseCommit)) throw new TypeError("Autonomy base commit is invalid.");
  if (!Array.isArray(value.allowedPaths) || value.allowedPaths.length < 1 || value.allowedPaths.length > 64) throw new TypeError("Autonomy allowed paths are invalid.");
  const paths = [...new Set(value.allowedPaths.map((item) => {
    if (typeof item !== "string" || item.length < 1 || item.length > 240 || item.startsWith("/") || item.includes("\\") || item.split("/").some((part) => part === "" || part === "." || part === "..")) throw new TypeError("Autonomy allowed path is invalid.");
    return item.replace(/\/$/, "");
  }))].sort();
  if (paths.length !== value.allowedPaths.length) throw new TypeError("Autonomy allowed paths must be unique.");
  return Object.freeze({ baseCommit, allowedPaths: Object.freeze(paths) });
}

function creditFreeRequested({ creditFreeRequired, requestedMode }) {
  return creditFreeRequired === true || requestedMode === "credit-free";
}

function taskTypeForProvider(provider) {
  if (provider === "self-healer") return "repair";
  if (provider === "local-core" || provider === "steward-learning") return "local";
  return "repository";
}

function creditFreeContextFrom(value) {
  if (value == null) return Object.freeze({});
  if (typeof value !== "object" || Array.isArray(value)) throw new TypeError("Credit-free context is invalid.");
  const context = {};
  if ("localReasonerReady" in value) context.localReasonerReady = value.localReasonerReady === true;
  if ("spendGrantUsd" in value) context.spendGrantUsd = Number(value.spendGrantUsd);
  if ("platformApiKeyPresent" in value) context.platformApiKeyPresent = value.platformApiKeyPresent === true;
  if ("allowPaidFallback" in value) context.allowPaidFallback = value.allowPaidFallback === true;
  if ("providers" in value) context.providers = value.providers;
  if ("requestedProvider" in value) context.requestedProvider = value.requestedProvider;
  if ("vercelDeploymentsToday" in value) context.vercelDeploymentsToday = Number(value.vercelDeploymentsToday);
  if ("vercelDailyCap" in value) context.vercelDailyCap = Number(value.vercelDailyCap);
  if ("extraVercelProjects" in value) context.extraVercelProjects = Number(value.extraVercelProjects);
  return Object.freeze(context);
}

function creditFreeTask({ node, outcome, conversationId, taskArea, contract }) {
  const decision = assertCreditFreeDispatch({ requestedProvider: node.provider });
  return {
    id: node.id,
    authoritySource: AUTONOMY_OBJECTIVE_AUTHORITY,
    capability: node.capability,
    dataClass: "synthetic",
    taskType: taskTypeForProvider(node.provider),
    requestedMode: "automatic",
    executionPlane: "local",
    priority: "high",
    maximumAttempts: 1,
    conversationId,
    taskArea,
    owner: "mahoraga",
    provider: node.provider,
    retryPolicy: "bounded",
    completionCriteria: node.completionCriteria,
    requestedOutcome: outcome,
    baseCommit: contract.baseCommit,
    allowedPaths: [...contract.allowedPaths],
    dependsOn: [...node.dependsOn],
    creditFreeRequired: true,
    creditCost: decision.creditCost,
    paidFallback: decision.paidFallback,
    plane: decision.plane,
    className: decision.className,
  };
}

function codexTask({ id, dependsOn, outcome, conversationId, requestedMode, taskArea, contract }) {
  return {
    id,
    authoritySource: AUTONOMY_OBJECTIVE_AUTHORITY,
    capability: "codex.execute",
    dataClass: "synthetic",
    taskType: "codex-builder",
    requestedMode,
    executionPlane: "primary-codex-local",
    priority: "high",
    maximumAttempts: 1,
    conversationId,
    taskArea,
    owner: "mahoraga",
    provider: "primary-codex-builder",
    retryPolicy: "bounded",
    completionCriteria: "worker-verified",
    requestedOutcome: outcome,
    baseCommit: contract.baseCommit,
    allowedPaths: [...contract.allowedPaths],
    dependsOn,
  };
}

function repositoryTask({ id, dependsOn, outcome, conversationId, taskArea, completionCriteria }) {
  return {
    id,
    authoritySource: AUTONOMY_OBJECTIVE_AUTHORITY,
    capability: "repository.verify",
    dataClass: "synthetic",
    taskType: "repository",
    requestedMode: "automatic",
    executionPlane: "local",
    priority: "high",
    maximumAttempts: 1,
    conversationId,
    taskArea,
    owner: "mahoraga",
    provider: "repository",
    retryPolicy: "bounded",
    completionCriteria,
    requestedOutcome: outcome,
    dependsOn,
  };
}

function buildCreditFreeObjective({ conversationId, messageId, request, area, contract, creditFreeContext }) {
  const plan = planCreditFreeWork({ message: request, ...creditFreeContext });
  const graph = plan.graph ?? CREDIT_FREE_GRAPH;
  const context = `User request: ${request}`;
  const tasks = graph.map((node) => creditFreeTask({
    node,
    outcome: `${node.id} the bounded credit-free protocol for ${context}`,
    conversationId,
    taskArea: area,
    contract,
  }));
  return Object.freeze({
    title: `Credit-free autonomous: ${request}`.slice(0, 240),
    correlationId: `aut-${messageId}`.slice(0, 240),
    maximumReplans: 2,
    creditFreeRequired: true,
    creditCost: 0,
    paidFallback: false,
    intentKind: plan.intentKind,
    nextAction: plan.nextAction,
    stewardGap: plan.stewardGap,
    tasks: Object.freeze(tasks.map((task) => Object.freeze(task))),
  });
}

export function buildAutonomyObjective({
  conversationId,
  messageId,
  message,
  requestedMode = "hybrid",
  taskArea = "mahoraga-autonomy",
  executionContract: suppliedExecutionContract = null,
  creditFreeRequired = false,
  creditFreeContext = null,
}) {
  const contract = executionContract(suppliedExecutionContract);
  const request = boundedText(message, "Complete the requested Mahoraga improvement.");
  const area = boundedText(taskArea, "mahoraga-autonomy").toLowerCase().replace(/[^a-z0-9-]+/g, "-").slice(0, 80);
  if (creditFreeRequested({ creditFreeRequired, requestedMode })) {
    return buildCreditFreeObjective({
      conversationId,
      messageId,
      request,
      area,
      contract,
      creditFreeContext: creditFreeContextFrom(creditFreeContext),
    });
  }
  const context = `User request: ${request}`;
  const tasks = [
    codexTask({ id: "propose", dependsOn: [], outcome: `Propose a concrete implementation for ${context}`, conversationId, requestedMode, taskArea: area, contract }),
    codexTask({ id: "challenge", dependsOn: [], outcome: `Independently challenge assumptions, failure modes, and unsafe shortcuts for ${context}`, conversationId, requestedMode, taskArea: area, contract }),
    codexTask({ id: "synthesize", dependsOn: ["propose", "challenge"], outcome: `Synthesize the strongest bounded design for ${context}`, conversationId, requestedMode, taskArea: area, contract }),
    codexTask({ id: "implement", dependsOn: ["synthesize"], outcome: `Implement the synthesized change with focused evidence for ${context}`, conversationId, requestedMode, taskArea: area, contract }),
    repositoryTask({ id: "verify", dependsOn: ["implement"], outcome: `Run the repository verification contract for ${context}`, conversationId, taskArea: area, completionCriteria: "worker-verified" }),
    repositoryTask({ id: "integrate", dependsOn: ["verify"], outcome: `Integrate the exact verified head when the autonomous integration policy allows it for ${context}`, conversationId, taskArea: area, completionCriteria: "merge-after-verify" }),
  ];
  return Object.freeze({
    title: `Autonomous: ${request}`.slice(0, 240),
    correlationId: `aut-${messageId}`.slice(0, 240),
    maximumReplans: 2,
    tasks: Object.freeze(tasks.map((task) => Object.freeze(task))),
  });
}

export function createAutonomousConversationTurn({
  database,
  policy,
  conversationId,
  taskId = null,
  role = "user",
  content,
  attachments = [],
  requiresResponse = false,
  requestedMode = "hybrid",
  taskArea = "mahoraga-autonomy",
  executionContract: suppliedExecutionContract = null,
  creditFreeRequired = false,
  creditFreeContext = null,
}) {
  const shouldCreateObjective = policy?.conversationActivation === true && role === "user" && requiresResponse === true && taskId === null;
  const contract = shouldCreateObjective ? executionContract(suppliedExecutionContract) : null;
  const message = database.addConversationMessage({ conversationId, taskId, role, content, attachments, requiresResponse });
  if (!shouldCreateObjective) return Object.freeze({ message, objective: null });
  const objective = database.createObjective(buildAutonomyObjective({
    conversationId,
    messageId: message.id,
    message: content,
    requestedMode,
    taskArea,
    executionContract: contract,
    creditFreeRequired,
    creditFreeContext,
  }));
  return Object.freeze({ message, objective });
}

export function createAutonomousConversation({
  database,
  policy,
  title,
  initialMessage,
  attachments = [],
  requiresResponse = false,
  requestedMode = "hybrid",
  taskArea = "mahoraga-autonomy",
  executionContract: suppliedExecutionContract = null,
  creditFreeRequired = false,
  creditFreeContext = null,
}) {
  const shouldCreateObjective = policy?.conversationActivation === true && requiresResponse === true;
  const contract = shouldCreateObjective ? executionContract(suppliedExecutionContract) : null;
  const conversation = database.createConversation({ title, initialMessage, attachments });
  if (!shouldCreateObjective) return Object.freeze({ conversation, objective: null });
  const messages = database.listConversationMessages(conversation.id);
  const message = [...messages].reverse().find((item) => item.role === "user");
  if (!message) throw new TypeError("Initial conversation message is missing.");
  const objective = database.createObjective(buildAutonomyObjective({
    conversationId: conversation.id,
    messageId: message.id,
    message: message.content,
    requestedMode,
    taskArea,
    executionContract: contract,
    creditFreeRequired,
    creditFreeContext,
  }));
  return Object.freeze({ conversation, objective });
}
