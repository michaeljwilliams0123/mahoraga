import test from "node:test";
import assert from "node:assert/strict";
import {
  buildImpactMap,
  classifyDirectiveChange,
  compileDirective,
  distillAdaptiveLesson,
  evaluateReviewStop,
  selectRelevantLessons,
} from "../src/adaptive-directive-review.mjs";
import { loadAdaptiveReviewPolicy } from "../src/adaptive-review-policy.mjs";
import { buildTrustedStateLedger } from "../src/trusted-state-ledger.mjs";
import { createInstitutionalMemoryRecord } from "../src/institutional-memory.mjs";

const NOW = "2026-09-11T21:00:00.000Z";

test("directive compiler uses policy signals to bound review surfaces and constraints", async () => {
  const policy = await loadAdaptiveReviewPolicy();
  const directive = compileDirective({
    text: "Update the Copilot Studio UI and provider readiness, keep zero-credit behavior and Windows 3.6.0 rollback intact.",
    policy,
  });
  assert.deepEqual(directive.surfaces, ["policy", "provider", "runtime", "ui"]);
  assert.deepEqual(directive.constraints, ["preserve-windows-rollback", "preserve-zero-credit"]);
  assert.equal(directive.evidenceLadder[0], "directive");
  assert.match(directive.directiveId, /^dir-[a-f0-9]{16}$/);
});

test("impact map expands only the chains required by affected surfaces", async () => {
  const policy = await loadAdaptiveReviewPolicy();
  const directive = compileDirective({ text: "Refresh the README and cockpit UI.", policy });
  const impact = buildImpactMap({ directive, policy });
  assert.deepEqual(impact.surfaces, ["docs", "ui"]);
  assert.ok(impact.nodes.some((node) => node.id === "ui"));
  assert.ok(impact.nodes.some((node) => node.id === "docs"));
  assert.equal(impact.nodes.some((node) => node.id === "database"), false);
});
test("trusted state ledger expires runtime truth faster than repository contracts", async () => {
  const policy = await loadAdaptiveReviewPolicy();
  const ledger = buildTrustedStateLedger({
    policy,
    now: NOW,
    observations: [
      { id: "runtime-source", surface: "runtime", source: "runtime-api", authority: "authoritative", value: "abc", observedAt: "2026-09-11T20:50:00.000Z" },
      { id: "repo-contract", surface: "policy", source: "repo-contract", authority: "contract", value: "loopback-only", observedAt: "2026-09-11T20:50:00.000Z" },
    ],
  });
  assert.equal(ledger.facts.find((fact) => fact.id === "runtime-source").freshness, "stale");
  assert.equal(ledger.facts.find((fact) => fact.id === "repo-contract").freshness, "current");
});

test("lesson retrieval favors relevant active institutional memory", async () => {
  const policy = await loadAdaptiveReviewPolicy();
  const directive = compileDirective({ text: "Fix stale runtime UI readiness truth.", policy });
  const relevant = createInstitutionalMemoryRecord({
    memoryClass: "system-pattern", subject: "runtime-ui-truth",
    statement: "Runtime and UI readiness must expire stale evidence instead of preserving old truth.",
    provenance: "verified-outcome", confidence: 0.98, freshness: "current",
    objectiveIds: [], evidenceRefs: ["test:runtime-ui"], capability: "adaptive-review", supersedes: [],
  }, { observedAt: "2026-09-11T20:59:00.000Z" });
  const unrelated = createInstitutionalMemoryRecord({
    memoryClass: "procedure", subject: "branch-cleanup",
    statement: "Delete branches only after merge ancestry is proven.",
    provenance: "verified-outcome", confidence: 0.95, freshness: "current",
    objectiveIds: [], evidenceRefs: ["test:branches"], capability: "repository-review", supersedes: [],
  }, { observedAt: "2026-09-11T20:58:00.000Z" });
  const selected = selectRelevantLessons({ directive, memoryRecords: [unrelated, relevant], limit: 5 });
  assert.equal(selected[0].memoryId, relevant.memoryId);
  assert.equal(selected.some((item) => item.memoryId === unrelated.memoryId), false);
});
test("adaptive lesson distillation reuses institutional memory schema", () => {
  const lesson = distillAdaptiveLesson({
    subject: "provider-caller-drift",
    symptom: "The provider probe script omitted a newly required Power Platform readiness probe.",
    rootCause: "A contract expanded without upgrading every executable caller.",
    detectionRule: "Execute caller-level contract tests whenever a readiness collector adds a required probe.",
    preventionInvariant: "Contract expansion and all executable callers change in the same verified unit.",
    evidenceRefs: ["npm:providers:probe"],
    observedAt: NOW,
  });
  assert.equal(lesson.memoryClass, "system-pattern");
  assert.equal(lesson.capability, "adaptive-review");
  assert.equal(lesson.zeroCredit, true);
  assert.equal(lesson.providerRequired, false);
  assert.match(lesson.statement, /contract expansion/i);
});

test("classification distinguishes extend, conflict, blocked, and already-built states", async () => {
  const policy = await loadAdaptiveReviewPolicy();
  const directive = compileDirective({ text: "Improve runtime readiness reporting.", policy });
  assert.equal(classifyDirectiveChange({ directive, existingCoverage: 0, contradictions: [], blockers: [] }), "NEW");
  assert.equal(classifyDirectiveChange({ directive, existingCoverage: 0.5, contradictions: [], blockers: [] }), "EXTEND");
  assert.equal(classifyDirectiveChange({ directive, existingCoverage: 1, contradictions: [], blockers: [] }), "ALREADY_BUILT");
  assert.equal(classifyDirectiveChange({ directive, existingCoverage: 0.5, contradictions: ["runtime-vs-ui"], blockers: [] }), "CONFLICTS");
  assert.equal(classifyDirectiveChange({ directive, existingCoverage: 0.5, contradictions: [], blockers: ["owner-approval"] }), "BLOCKED");
});

test("review stop refuses stale or uncovered impact nodes", async () => {
  const policy = await loadAdaptiveReviewPolicy();
  const directive = compileDirective({ text: "Update runtime readiness.", policy });
  const impactMap = buildImpactMap({ directive, policy });
  const observations = impactMap.nodes.map((node) => ({
    id: `fact-${node.id}`, surface: node.id, source: "repo-contract", authority: "contract",
    value: "verified", observedAt: NOW,
  }));
  const complete = buildTrustedStateLedger({ observations, policy, now: NOW });
  const stopped = evaluateReviewStop({ impactMap, ledger: complete, contradictions: [], policy });
  assert.equal(stopped.stop, true);
  assert.equal(stopped.missingEvidence.length, 0);
  const incomplete = buildTrustedStateLedger({ observations: observations.slice(1), policy, now: NOW });
  const continued = evaluateReviewStop({ impactMap, ledger: incomplete, contradictions: [], policy });
  assert.equal(continued.stop, false);
  assert.ok(continued.missingEvidence.length > 0);
});
