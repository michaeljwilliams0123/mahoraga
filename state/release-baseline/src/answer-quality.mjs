import { createHash } from "node:crypto";

export const ANSWER_EVALUATOR_VERSION = "1.0.0";

const ACKNOWLEDGEMENT = /\b(?:i (?:have )?(?:saved|recorded|received|accepted)|i(?:'ll| will) (?:keep|continue|work on|look into)|assignment (?:accepted|saved|queued)|request (?:accepted|received)|execution is pending|will keep the context)\b/i;
const VAGUE = /^(?:done|completed|complete|handled|fixed|looks good|all good|ok(?:ay)?|success(?:ful)?|not[- ]?found|unknown|unavailable)[.!]?$/i;
const UNCERTAINTY = /\b(?:unable|unavailable|unknown|unverified|not[- ]found|not[- ]implemented|not[- ]completed|failed|cannot|can't|do not know|don't know|error)\b/i;
const RESOLVED_NEGATIVE = /\bno (?:errors?|failures?|issues?|problems?)\b/gi;
const RESOLUTION = /\b(?:because|corrected|fix(?:ed)?|resolved|restart(?:ed)?|solution|verified)\b/i;
const STOP_WORDS = new Set([
  "about", "after", "again", "also", "and", "are", "been", "before", "being", "but", "can", "could",
  "does", "for", "from", "have", "into", "just", "make", "more", "only", "other", "please", "should",
  "that", "the", "their", "then", "there", "these", "they", "this", "those", "through", "using", "want",
  "what", "when", "where", "which", "while", "will", "with", "would", "your",
]);

export function evaluateAnswerQuality({ task, result }) {
  if (!task || typeof task !== "object") throw new TypeError("answer-quality-task-required");
  if (!result || typeof result !== "object") throw new TypeError("answer-quality-result-required");
  const summary = normalize(result.summary);
  const criteria = normalize(task.completionCriteria ?? "worker-verified");
  const requestedOutcome = normalize(task.requestedOutcome ?? task.capability ?? "task completion");
  const declared = completionEvidence(result.completionEvidence);
  const summaryTokens = tokens(summary);
  const criterionTokens = tokens(criteria === "worker-verified" || criteria === "substantive-response"
    ? requestedOutcome
    : `${criteria} ${requestedOutcome}`);
  const matchedCriterionCount = criterionTokens.filter((token) => summaryTokens.includes(token)).length;
  const providerVerified = result.verified === true;
  const acknowledgementDetected = ACKNOWLEDGEMENT.test(summary);
  const vagueDetected = summary.length === 0 || VAGUE.test(summary);
  const contradictionDetected = UNCERTAINTY.test(summary.replace(RESOLVED_NEGATIVE, "")) && !RESOLUTION.test(summary);
  const strongResponseRequired = task.capability === "assistant.respond" || criteria !== "worker-verified";
  const reasons = [];

  if (!summary) reasons.push("missing-summary");
  if (!providerVerified) reasons.push("provider-verification-failed");
  if (vagueDetected) reasons.push("vague-response");
  if (acknowledgementDetected && declared.evidenceCount === 0) reasons.push("mere-acknowledgement");
  if (contradictionDetected && providerVerified) reasons.push("contradictory-answer");
  if (declared.unresolved) reasons.push("provider-declared-unresolved");
  if (declared.criteriaSatisfied === false) reasons.push("completion-criteria-unsatisfied");
  if (strongResponseRequired && summaryTokens.length < 8 && declared.evidenceCount === 0) reasons.push("insufficient-detail");
  if (strongResponseRequired && criterionTokens.length > 0 && matchedCriterionCount === 0 && declared.evidenceCount === 0) {
    reasons.push("nonresponsive-response");
  }

  const uniqueReasons = Object.freeze([...new Set(reasons)]);
  return Object.freeze({
    accepted: uniqueReasons.length === 0,
    reasons: uniqueReasons,
    evidence: Object.freeze({
      summarySha256: digest(summary),
      criteriaSha256: digest(criteria),
      summaryWordCount: summaryTokens.length,
      criterionTokenCount: criterionTokens.length,
      matchedCriterionCount,
      providerVerified,
      declaredEvidenceCount: declared.evidenceCount,
      acknowledgementDetected,
      vagueDetected,
      contradictionDetected,
    }),
  });
}

export function unresolvedAnswerSummary(evaluation, attemptCount) {
  if (!evaluation || evaluation.accepted !== false || !Array.isArray(evaluation.reasons) || evaluation.reasons.length < 1) {
    throw new TypeError("answer-quality-unresolved-evaluation-required");
  }
  if (!Number.isInteger(attemptCount) || attemptCount < 1 || attemptCount > 20) throw new TypeError("answer-quality-attempt-invalid");
  const checks = evaluation.reasons.map((reason) => reason.replaceAll("-", " ")).join(", ");
  return `Mahoraga could not verify a complete response after ${attemptCount} bounded attempt${attemptCount === 1 ? "" : "s"}. Unresolved checks: ${checks}. No claim of completion was recorded.`;
}

function completionEvidence(value) {
  if (value === undefined || value === null) return Object.freeze({ criteriaSatisfied: null, evidenceCount: 0, unresolved: false });
  if (typeof value !== "object" || Array.isArray(value)) throw new TypeError("answer-quality-completion-evidence-invalid");
  const allowed = new Set(["criteriaSatisfied", "evidenceCount", "unresolved"]);
  for (const key of Object.keys(value)) if (!allowed.has(key)) throw new TypeError("answer-quality-completion-evidence-field-invalid");
  if (value.criteriaSatisfied !== true && value.criteriaSatisfied !== false) throw new TypeError("answer-quality-criteria-state-invalid");
  if (!Number.isInteger(value.evidenceCount) || value.evidenceCount < 0 || value.evidenceCount > 1000) throw new TypeError("answer-quality-evidence-count-invalid");
  if (typeof value.unresolved !== "boolean") throw new TypeError("answer-quality-unresolved-state-invalid");
  return Object.freeze({ criteriaSatisfied: value.criteriaSatisfied, evidenceCount: value.evidenceCount, unresolved: value.unresolved });
}

function tokens(value) {
  return [...new Set(String(value).toLowerCase().match(/[a-z0-9]+/g) ?? [])]
    .filter((token) => (token.length >= 3 || /^\d+$/.test(token)) && !STOP_WORDS.has(token));
}
function normalize(value) { return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, 4000) : ""; }
function digest(value) { return createHash("sha256").update(value, "utf8").digest("hex"); }
