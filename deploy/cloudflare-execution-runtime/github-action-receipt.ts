/**
 * Content-free GitHub App return receipt bound to an owner's persisted turn.
 * The App has already validated GitHub's response; this projection cannot itself
 * establish an independently authenticated owner session or a deployment PASS.
 */
export type GitHubActionReceipt = {
  action: string;
  kind: "repository" | "pull-request" | "issue" | "workflow" | "comment";
  number?: number;
  commentId?: number;
  headSha?: string;
  mainSha?: string;
  runId?: number;
  outcome: "observed" | "accepted" | "pending" | "success" | "failure";
};

const SHA = /^[a-f0-9]{40}$/;
const positive = (n: unknown): n is number => Number.isSafeInteger(n) && (n as number) > 0;
const obj = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
const commit = (value: unknown): string | undefined =>
  typeof value === "string" && SHA.test(value) ? value : undefined;

/**
 * Only admit documented, validated, action-specific GitHub App responses.
 * Never project arbitrary text, URLs, title, body, prompt or provider payload.
 */
export function projectGitHubActionReceipt(action: string, transaction: unknown): GitHubActionReceipt | null {
  const t = obj(transaction);
  if (t?.provider !== "github-app" || t.repository !== "michaeljwilliams0123/mahoraga") return null;
  const head = obj(t.head);
  const main = obj(t.main);
  if (action === "status") {
    const mainSha = commit(t.headSha);
    return mainSha ? { action, kind: "repository", mainSha, outcome: "observed" } : null;
  }
  if (action === "create" && positive(t.number) && t.draft === true && t.state === "open") {
    const headSha = commit(head?.sha);
    return headSha ? { action, kind: "pull-request", number: t.number, headSha, outcome: "accepted" } : null;
  }
  if (action === "merge" && positive(t.number) && t.merged === true && t.mergeMethod === "squash") {
    const headSha = commit(head?.sha), mainSha = commit(main?.sha);
    return headSha && mainSha ? { action, kind: "pull-request", number: t.number, headSha, mainSha, outcome: "success" } : null;
  }
  if (action === "dispatch" && t.accepted === true) {
    const headSha = commit(t.headSha), run = obj(t.run);
    return headSha ? { action, kind: "workflow", headSha,
      ...(positive(run?.id) ? { runId: run.id } : {}), outcome: "accepted" } : null;
  }
  if ((action === "checks" || action === "diagnose") && positive(t.number)) {
    const headSha = commit(head?.sha), run = obj(t.run);
    const state = t.state;
    if (!headSha || (state !== "success" && state !== "failure" && state !== "pending")) return null;
    return { action, kind: "pull-request", number: t.number, headSha,
      ...(positive(run?.id) ? { runId: run.id } : {}), outcome: state };
  }
  if (["issue-create", "issue-update", "pr-update", "comment-create", "comment-delete"].includes(action) &&
      t.action === action && positive(t.number) &&
      (t.kind === "issue" || t.kind === "pull-request") &&
      (action === "pr-update" ? t.kind === "pull-request"
        : action.startsWith("issue-") ? t.kind === "issue"
        : positive(t.commentId))) {
    return { action, kind: action.startsWith("comment") ? "comment" : t.kind,
      number: t.number,
      ...(positive(t.commentId) ? { commentId: t.commentId } : {}),
      outcome: "accepted" };
  }
  return null;
}

export function readGitHubActionReceipt(json: string | null): GitHubActionReceipt | null {
  if (!json || json.length > 1600) return null;
  let r: unknown;
  try { r = JSON.parse(json); } catch { return null; }
  const item = obj(r);
  if (!item || typeof item.action !== "string" || item.action.length > 32) return null;
  const kind = item.kind;
  if (!["repository", "pull-request", "issue", "workflow", "comment"].includes(String(kind))) return null;
  if (!["observed", "accepted", "pending", "success", "failure"].includes(String(item.outcome))) return null;
  if ((item.number !== undefined && !positive(item.number)) || (item.commentId !== undefined && !positive(item.commentId)) ||
      (item.runId !== undefined && !positive(item.runId)) ||
      (item.headSha !== undefined && !commit(item.headSha)) || (item.mainSha !== undefined && !commit(item.mainSha))) return null;
  // A well-formed scalar is insufficient: replay must retain the same
  // action-specific guarantees as the original native response projection.
  const validAction = (() => {
    switch (item.action) {
      case "status": return kind === "repository" && !!commit(item.mainSha) && item.outcome === "observed";
      case "create": return kind === "pull-request" && positive(item.number) && !!commit(item.headSha) && item.outcome === "accepted";
      case "merge": return kind === "pull-request" && positive(item.number) && !!commit(item.headSha) && !!commit(item.mainSha) && item.outcome === "success";
      case "dispatch": return kind === "workflow" && !!commit(item.headSha) && item.outcome === "accepted";
      case "checks": case "diagnose": return kind === "pull-request" && positive(item.number) && !!commit(item.headSha) && ["pending", "success", "failure"].includes(String(item.outcome));
      case "issue-create": case "issue-update": return kind === "issue" && positive(item.number) && item.outcome === "accepted";
      case "pr-update": return kind === "pull-request" && positive(item.number) && item.outcome === "accepted";
      case "comment-create": case "comment-delete": return kind === "comment" && positive(item.number) && positive(item.commentId) && item.outcome === "accepted";
      default: return false;
    }
  })();
  if (!validAction) return null;
  const { action, outcome } = item;
  return { action, kind: kind as GitHubActionReceipt["kind"],
    ...(positive(item.number) ? { number: item.number } : {}),
    ...(positive(item.commentId) ? { commentId: item.commentId } : {}),
    ...(positive(item.runId) ? { runId: item.runId } : {}),
    ...(commit(item.headSha) ? { headSha: item.headSha as string } : {}),
    ...(commit(item.mainSha) ? { mainSha: item.mainSha as string } : {}),
    outcome: outcome as GitHubActionReceipt["outcome"] };
}
