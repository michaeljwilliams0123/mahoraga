import { classifyAutonomyProvider, selectCreditFreeExecutionPlane } from "./credit-free-autonomy.mjs";

export const CREDIT_FREE_OPERATOR_ACTORS = Object.freeze(["grok-github-mcp", "github-operator", "chatgpt-github-mcp"]);
export const CREDIT_FREE_OPERATOR_ACTIONS = Object.freeze([
  "inspect",
  "repair",
  "comment",
  "assign",
  "merge-exact-head",
  "close-superseded",
]);
export const HOST_MUTATING_OPERATOR_ACTIONS = Object.freeze(["repair", "merge-exact-head"]);

const MCP_CREDIT_FREE_SPENDING = Object.freeze(["zero", "credit-free", "deterministic"]);
const MCP_METERED_SPENDING = Object.freeze(["licensed-cloud", "metered", "metered-cloud"]);

export function classifyMcpSpendingClass(spendingClass) {
  const name = String(spendingClass ?? "").trim().toLowerCase();
  if (MCP_CREDIT_FREE_SPENDING.includes(name)) return "credit-free";
  if (MCP_METERED_SPENDING.includes(name)) return "metered";
  return "unknown";
}

export function admitOwnerGitHubOperator({
  actor = "grok-github-mcp",
  action = "inspect",
  requestsCodexReview = false,
  opensCycleIdOnlyPr = false,
  addsMergeGate = false,
  invokesMeteredInference = false,
  deletesRef = false,
  untrustedContentPresent = false,
  requestedProvider = "github-operator",
} = {}) {
  if (requestsCodexReview === true) return blocked("codex-review-forbidden");
  if (opensCycleIdOnlyPr === true) return blocked("cycleid-only-pr-forbidden");
  if (addsMergeGate === true) return blocked("extra-merge-gate-forbidden");
  if (invokesMeteredInference === true) return blocked("metered-provider-forbidden");
  if (deletesRef === true) return blocked("delete-ref-forbidden");
  if (untrustedContentPresent === true && HOST_MUTATING_OPERATOR_ACTIONS.includes(action)) {
    return blocked("untrusted-content-mutation-forbidden");
  }

  const actorId = String(actor ?? "").trim().toLowerCase();
  if (!CREDIT_FREE_OPERATOR_ACTORS.includes(actorId)) return blocked("operator-actor-unknown");
  if (!CREDIT_FREE_OPERATOR_ACTIONS.includes(action)) return blocked("operator-action-not-admitted");

  const plane = selectCreditFreeExecutionPlane({ requestedProvider });
  if (!plane.ok) return blocked(plane.reason);

  return Object.freeze({
    ok: true,
    status: "admissible",
    reason: null,
    actor: actorId,
    action,
    provider: plane.provider,
    className: classifyAutonomyProvider(requestedProvider),
    creditCost: 0,
    paidFallback: false,
    scheduler: false,
    denyFirst: true,
  });
}

function blocked(reason) {
  return Object.freeze({
    ok: false,
    status: "blocked",
    reason,
    actor: null,
    action: null,
    provider: null,
    className: null,
    creditCost: 0,
    paidFallback: false,
    scheduler: false,
    denyFirst: true,
  });
}
