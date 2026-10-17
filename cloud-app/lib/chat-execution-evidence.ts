export type ChatExecutionEvidence =
  | { status: "unavailable"; reason: "correlation-unavailable" | "task-not-completed" | "metadata-unavailable" }
  | { status: "reported"; taskId: string; workerId: string; providerId: string; costClass: string; creditPolicy: string; memoryState?: "indexed" | "pending"; sourceSHA?: string;
      persistedResultObservation?: "matched" | "missing" | "mismatch" | "not-observed";
      githubActionReceipt?: { action: string; kind: "repository" | "pull-request" | "issue" | "workflow" | "comment";
        number?: number; commentId?: number; headSha?: string; mainSha?: string; runId?: number;
        outcome: "observed" | "accepted" | "pending" | "success" | "failure" } };

const record = (value: unknown): Record<string, unknown> | null => value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
const identifier = (value: unknown): value is string => typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/.test(value);
const COST_CLASSES = new Set(["deterministic", "cloud-open-weight", "local-open-weight", "zero-credit", "licensed-cloud", "metered-cloud"]);
const CREDIT_POLICIES = new Set(["zero-codex", "licensed-approved"]);
const GITHUB_ACTIONS = new Set(["status", "create", "merge", "dispatch", "checks", "diagnose", "issue-create", "issue-update", "pr-update", "comment-create", "comment-delete"]);
const GITHUB_KINDS = new Set(["repository", "pull-request", "issue", "workflow", "comment"]);
const GITHUB_OUTCOMES = new Set(["observed", "accepted", "pending", "success", "failure"]);
const positive = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) > 0;
function projectGitHubReceipt(value: unknown) {
  const x = record(value);
  if (!x || typeof x.action !== "string" || !GITHUB_ACTIONS.has(x.action) ||
      typeof x.kind !== "string" || !GITHUB_KINDS.has(x.kind) ||
      typeof x.outcome !== "string" || !GITHUB_OUTCOMES.has(x.outcome) ||
      ["number", "commentId", "runId"].some(key => x[key] !== undefined && !positive(x[key])) ||
      ["headSha", "mainSha"].some(key => x[key] !== undefined && (typeof x[key] !== "string" || !/^[a-f0-9]{40}$/.test(x[key])))) return null;
  // Revalidate action semantics at the UI boundary, including reconnected reads.
  // An acknowledged dispatch cannot become a successful run or a merge without SHAs.
  const validAction = (() => {
    switch (x.action) {
      case "status": return x.kind === "repository" && !!x.mainSha && x.outcome === "observed";
      case "create": return x.kind === "pull-request" && positive(x.number) && !!x.headSha && x.outcome === "accepted";
      case "merge": return x.kind === "pull-request" && positive(x.number) && !!x.headSha && !!x.mainSha && x.outcome === "success";
      case "dispatch": return x.kind === "workflow" && !!x.headSha && x.outcome === "accepted";
      case "checks": case "diagnose": return x.kind === "pull-request" && positive(x.number) && !!x.headSha && ["pending", "success", "failure"].includes(String(x.outcome));
      case "issue-create": case "issue-update": return x.kind === "issue" && positive(x.number) && x.outcome === "accepted";
      case "pr-update": return x.kind === "pull-request" && positive(x.number) && x.outcome === "accepted";
      case "comment-create": case "comment-delete": return x.kind === "comment" && positive(x.number) && positive(x.commentId) && x.outcome === "accepted";
      default: return false;
    }
  })();
  if (!validAction) return null;
  return { action: x.action, kind: x.kind as "repository" | "pull-request" | "issue" | "workflow" | "comment",
    ...(positive(x.number) ? { number: x.number } : {}),
    ...(positive(x.commentId) ? { commentId: x.commentId } : {}),
    ...(positive(x.runId) ? { runId: x.runId } : {}),
    ...(typeof x.headSha === "string" ? { headSha: x.headSha } : {}),
    ...(typeof x.mainSha === "string" ? { mainSha: x.mainSha } : {}),
    outcome: x.outcome as "observed" | "accepted" | "pending" | "success" | "failure" };
}

/** This is supplied task metadata, never independent execution or authority proof. */
export function projectMessageExecution(message: unknown, tasks: unknown, conversationId: string): ChatExecutionEvidence {
  const m = record(message);
  if (!m || m.role !== "assistant" || !identifier(m.id) || !identifier(m.taskId) || !identifier(conversationId) || !Array.isArray(tasks)) {
    return { status: "unavailable", reason: "correlation-unavailable" };
  }
  const matches = tasks.map(record).filter(task => task?.id === m.taskId);
  const task = matches[0];
  if (matches.length !== 1 || !task || task.conversationId !== conversationId) return { status: "unavailable", reason: "correlation-unavailable" };
  if (task.status !== "completed") return { status: "unavailable", reason: "task-not-completed" };
  const receipt = record(task.executionReceipt);
  if (!receipt || !identifier(receipt.workerId) || !identifier(receipt.providerId)
    || typeof receipt.costClass !== "string" || !COST_CLASSES.has(receipt.costClass)
    || typeof receipt.creditPolicy !== "string" || !CREDIT_POLICIES.has(receipt.creditPolicy)
    || (receipt.memoryState !== undefined && receipt.memoryState !== "indexed" && receipt.memoryState !== "pending")) {
    return { status: "unavailable", reason: "metadata-unavailable" };
  }
  return { status: "reported", taskId: m.taskId, workerId: receipt.workerId, providerId: receipt.providerId,
    costClass: receipt.costClass, creditPolicy: receipt.creditPolicy,
    ...(typeof receipt.sourceSHA === "string" && /^[a-f0-9]{40}$/i.test(receipt.sourceSHA) ? { sourceSHA: receipt.sourceSHA } : {}),
    ...(receipt.memoryState === undefined ? {} : { memoryState: receipt.memoryState }),
    ...(["matched", "missing", "mismatch", "not-observed"].includes(String(receipt.persistedResultObservation))
      ? { persistedResultObservation: receipt.persistedResultObservation as "matched" | "missing" | "mismatch" | "not-observed" } : {}),
    ...(projectGitHubReceipt(receipt.githubActionReceipt) ? { githubActionReceipt: projectGitHubReceipt(receipt.githubActionReceipt)! } : {}) };
}

/** Join the existing history/messages/tasks reads by IDs; never by order or text. */
export function projectSavedConversation(
  history: Array<{ id: string; role: "user" | "assistant"; text: string }>,
  runtimeMessages: unknown, tasks: unknown, conversationId: string,
) {
  const seen = new Set<string>();
  const candidates = Array.isArray(runtimeMessages) ? runtimeMessages.map(record) : [];
  return history.filter(message => {
    if (seen.has(message.id)) return false;
    seen.add(message.id);
    return true;
  }).map(message => {
    const matches = candidates.filter(candidate => candidate?.id === message.id && candidate.role === message.role);
    return { id: `runtime-${message.id}`, role: message.role, text: message.text,
      ...(message.role === "assistant" ? { executionEvidence: projectMessageExecution(matches.length === 1 ? matches[0] : null, tasks, conversationId) } : {}) };
  });
}

export async function loadSavedConversation(transport: {
  conversationHistory(id: string): Promise<Array<{ id: string; role: "user" | "assistant"; text: string }>>;
  messages(id: string): Promise<unknown>;
  tasks(id: string): Promise<unknown>;
}, conversationId: string) {
  // Receipt reads are optional; their failure must not discard a valid answer.
  const [history, messages, tasks] = await Promise.all([
    transport.conversationHistory(conversationId),
    transport.messages(conversationId).catch(() => []),
    transport.tasks(conversationId).catch(() => []),
  ]);
  return projectSavedConversation(history, messages, tasks, conversationId);
}
