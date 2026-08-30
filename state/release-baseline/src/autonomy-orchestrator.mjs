const MAX_MESSAGE_LENGTH = 800;

function boundedText(value, fallback) {
  const normalized = String(value ?? "").replace(/\s+/g, " ").trim();
  return (normalized || fallback).slice(0, MAX_MESSAGE_LENGTH);
}

function codexTask({ id, dependsOn, outcome, conversationId, requestedMode, taskArea }) {
  return {
    id,
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
    dependsOn,
  };
}

function repositoryTask({ id, dependsOn, outcome, conversationId, taskArea, completionCriteria }) {
  return {
    id,
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

export function buildAutonomyObjective({
  conversationId,
  messageId,
  message,
  requestedMode = "hybrid",
  taskArea = "mahoraga-autonomy",
}) {
  const request = boundedText(message, "Complete the requested Mahoraga improvement.");
  const area = boundedText(taskArea, "mahoraga-autonomy").toLowerCase().replace(/[^a-z0-9-]+/g, "-").slice(0, 80);
  const context = `User request: ${request}`;
  const tasks = [
    codexTask({ id: "propose", dependsOn: [], outcome: `Propose a concrete implementation for ${context}`, conversationId, requestedMode, taskArea: area }),
    codexTask({ id: "challenge", dependsOn: [], outcome: `Independently challenge assumptions, failure modes, and unsafe shortcuts for ${context}`, conversationId, requestedMode, taskArea: area }),
    codexTask({ id: "synthesize", dependsOn: ["propose", "challenge"], outcome: `Synthesize the strongest bounded design for ${context}`, conversationId, requestedMode, taskArea: area }),
    codexTask({ id: "implement", dependsOn: ["synthesize"], outcome: `Implement the synthesized change with focused evidence for ${context}`, conversationId, requestedMode, taskArea: area }),
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
}) {
  const message = database.addConversationMessage({ conversationId, taskId, role, content, attachments, requiresResponse });
  const shouldCreateObjective = policy?.conversationActivation === true && role === "user" && requiresResponse === true && taskId === null;
  if (!shouldCreateObjective) return Object.freeze({ message, objective: null });
  const objective = database.createObjective(buildAutonomyObjective({
    conversationId,
    messageId: message.id,
    message: content,
    requestedMode,
    taskArea,
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
}) {
  const conversation = database.createConversation({ title, initialMessage, attachments });
  const shouldCreateObjective = policy?.conversationActivation === true && requiresResponse === true;
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
  }));
  return Object.freeze({ conversation, objective });
}
