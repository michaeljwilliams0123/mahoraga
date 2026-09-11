import { createHash } from "node:crypto";
import { createInstitutionalMemoryRecord, queryInstitutionalMemory } from "./institutional-memory.mjs";

const STOP_WORDS = new Set(["about", "after", "again", "also", "and", "before", "from", "have", "into", "keep", "make", "only", "that", "the", "their", "then", "this", "with"]);

export function compileDirective({ text, policy } = {}) {
  if (!policy || typeof policy !== "object") fail("adaptive-directive-policy-required");
  const normalized = normalizeText(text, 8000, "adaptive-directive-text-invalid");
  const lower = normalized.toLowerCase();
  const surfaces = Object.entries(policy.surfaceSignals ?? {})
    .filter(([, signals]) => signals.some((signal) => matchesSignal(lower, signal)))
    .map(([surface]) => surface)
    .sort();
  const constraints = Object.entries(policy.constraintSignals ?? {})
    .filter(([, signals]) => signals.some((signal) => matchesSignal(lower, signal)))
    .map(([constraint]) => constraint)
    .sort();
  const policyAwareSurfaces = constraints.length > 0 && policy.impactChains?.policy ? [...new Set([...surfaces, "policy"])] : surfaces;
  const resolvedSurfaces = policyAwareSurfaces.length > 0 ? policyAwareSurfaces.sort() : [...policy.defaultSurfaces].sort();
  const tokens = significantTokens(lower);
  const identity = { text: normalized, surfaces: resolvedSurfaces, constraints };
  const directiveId = `dir-${digest(identity).slice(0, 16)}`;
  return deepFreeze({
    schemaVersion: 1,
    directiveId,
    desiredOutcome: normalized,
    normalizedText: lower,
    surfaces: resolvedSurfaces,
    constraints,
    tokens,
    evidenceLadder: [...policy.evidenceLadder],
    classificationCandidates: [...policy.classifications],
    reviewMode: policy.mode,
    zeroCredit: true,
    providerRequired: false,
  });
}

export function buildImpactMap({ directive, policy } = {}) {
  if (!directive || typeof directive !== "object" || !policy || typeof policy !== "object") fail("adaptive-impact-input-invalid");
  const membership = new Map();
  const order = [];
  for (const surface of directive.surfaces ?? []) {
    const chain = policy.impactChains?.[surface];
    if (!Array.isArray(chain)) fail("adaptive-impact-chain-missing");
    for (const node of chain) {
      if (!membership.has(node)) { membership.set(node, new Set()); order.push(node); }
      membership.get(node).add(surface);
    }
  }
  const nodes = order.map((id, index) => deepFreeze({ id, order: index + 1, surfaces: [...membership.get(id)].sort() }));
  return deepFreeze({ schemaVersion: 1, directiveId: directive.directiveId, surfaces: [...directive.surfaces], nodes, zeroCredit: true });
}
export function selectRelevantLessons({ directive, memoryRecords = [], limit = 12 } = {}) {
  if (!directive || typeof directive !== "object" || !Array.isArray(memoryRecords) || !Number.isInteger(limit) || limit < 1 || limit > 100) fail("adaptive-lessons-input-invalid");
  const active = queryInstitutionalMemory({ records: memoryRecords, limit: Math.min(1000, Math.max(limit * 20, 100)) });
  const terms = new Set([...(directive.surfaces ?? []), ...(directive.tokens ?? [])]);
  const scored = active.map((record) => {
    const subject = record.subject.toLowerCase();
    const statement = record.statement.toLowerCase();
    const capability = record.capability.toLowerCase();
    let score = 0;
    for (const surface of directive.surfaces ?? []) {
      if (subject.includes(surface)) score += 5;
      if (statement.includes(surface)) score += 4;
      if (capability.includes(surface)) score += 3;
    }
    for (const term of terms) {
      if (term.length < 4) continue;
      if (subject.includes(term)) score += 2;
      if (statement.includes(term)) score += 1;
    }
    score += record.freshness === "current" ? 2 : record.freshness === "aging" ? 1 : record.freshness === "stale" ? -2 : 0;
    score += record.confidence;
    return { record, score };
  });
  return deepFreeze(scored
    .filter((item) => item.score >= 4)
    .sort((a, b) => b.score - a.score || b.record.observedAt.localeCompare(a.record.observedAt) || a.record.memoryId.localeCompare(b.record.memoryId))
    .slice(0, limit)
    .map((item) => item.record));
}

export function distillAdaptiveLesson({
  subject,
  symptom,
  rootCause,
  detectionRule,
  preventionInvariant,
  evidenceRefs = [],
  supersedes = [],
  confidence = 0.98,
  observedAt = new Date().toISOString(),
} = {}) {
  const statement = [
    `Symptom: ${normalizeText(symptom, 900, "adaptive-lesson-symptom-invalid")}`,
    `Root cause: ${normalizeText(rootCause, 900, "adaptive-lesson-root-cause-invalid")}`,
    `Detection rule: ${normalizeText(detectionRule, 900, "adaptive-lesson-detection-invalid")}`,
    `Prevention invariant: ${normalizeText(preventionInvariant, 900, "adaptive-lesson-invariant-invalid")}`,
  ].join(" ");
  return createInstitutionalMemoryRecord({
    memoryClass: "system-pattern",
    subject: normalizeSlug(subject, "adaptive-lesson-subject-invalid"),
    statement,
    provenance: "verified-outcome",
    confidence,
    freshness: "current",
    objectiveIds: [],
    evidenceRefs,
    capability: "adaptive-review",
    supersedes,
  }, { observedAt });
}
export function classifyDirectiveChange({ directive, existingCoverage = 0, contradictions = [], blockers = [], superseded = false } = {}) {
  if (!directive || typeof directive !== "object" || typeof existingCoverage !== "number" || existingCoverage < 0 || existingCoverage > 1 || !Array.isArray(contradictions) || !Array.isArray(blockers)) fail("adaptive-classification-input-invalid");
  if (blockers.length > 0) return "BLOCKED";
  if (contradictions.length > 0) return "CONFLICTS";
  if (superseded) return "SUPERSEDED";
  if (existingCoverage >= 1) return "ALREADY_BUILT";
  if (existingCoverage > 0) return "EXTEND";
  return "NEW";
}

export function evaluateReviewStop({ impactMap, ledger, contradictions = [], policy } = {}) {
  if (!impactMap || !ledger || !policy || !Array.isArray(contradictions)) fail("adaptive-stop-input-invalid");
  const trustedBySurface = new Set((ledger.facts ?? []).filter((fact) => fact.trusted === true && fact.freshness === "current").map((fact) => fact.surface));
  const missingEvidence = (impactMap.nodes ?? []).map((node) => node.id).filter((nodeId) => !trustedBySurface.has(nodeId));
  const total = Math.max(1, impactMap.nodes?.length ?? 0);
  const coverage = (total - missingEvidence.length) / total;
  const contradictionPenalty = contradictions.length > 0 ? 1 : 0;
  const confidence = Math.max(0, Number((coverage - contradictionPenalty).toFixed(4)));
  const stop = contradictions.length === 0 && missingEvidence.length === 0 && confidence >= Number(policy.stopConfidence ?? 1);
  return deepFreeze({
    schemaVersion: 1,
    stop,
    confidence,
    missingEvidence: [...missingEvidence].sort(),
    contradictions: [...contradictions].map(String).sort(),
    reason: stop ? "affected-chain-fully-covered" : contradictions.length > 0 ? "contradiction-unresolved" : "fresh-evidence-missing",
  });
}

function matchesSignal(text, signal) {
  const normalized = String(signal).toLowerCase();
  if (normalized.length <= 3 && /^[a-z0-9]+$/.test(normalized)) return new RegExp(`(?:^|[^a-z0-9])${escapeRegExp(normalized)}(?:$|[^a-z0-9])`, "i").test(text);
  return text.includes(normalized);
}

function significantTokens(value) {
  return [...new Set(value.split(/[^a-z0-9-]+/g)
    .map((item) => item.trim())
    .filter((item) => item.length >= 4 && !STOP_WORDS.has(item)))].sort();
}

function normalizeSlug(value, code) {
  if (typeof value !== "string" || !/^[a-z0-9][a-z0-9-]{0,95}$/.test(value)) fail(code);
  return value;
}

function normalizeText(value, maximum, code) {
  if (typeof value !== "string") fail(code);
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized || normalized.length > maximum || /\0/.test(value)) fail(code);
  return normalized;
}

function digest(value) { return createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
function escapeRegExp(value) { return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
function deepFreeze(value) { if (value && typeof value === "object" && !Object.isFrozen(value)) { Object.freeze(value); for (const child of Object.values(value)) deepFreeze(child); } return value; }
function fail(code) { const error = new TypeError(code); error.code = code; throw error; }
