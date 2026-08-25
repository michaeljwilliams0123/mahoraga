import test from "node:test";
import assert from "node:assert/strict";
import {
  getExpertSkill,
  listExpertSkills,
  selectExpertSkills,
  validateExpertSkillRegistry,
} from "../src/expert-skill-registry.mjs";

const EXPECTED = [
  "accounting-cpa",
  "ai-engineering",
  "computer-engineering",
  "data-analytics",
  "internal-audit-cia",
  "it-audit-cisa",
  "management-accounting-cgma",
  "programming",
  "writing-precision",
];

test("expert registry exposes all requested domains without credential claims", () => {
  const validation = validateExpertSkillRegistry();
  assert.deepEqual(validation, { schemaVersion: 1, skillCount: 9, valid: true });
  const skills = listExpertSkills();
  assert.deepEqual(skills.map((entry) => entry.id).sort(), EXPECTED);
  assert.ok(skills.every((entry) => entry.credentialClaim === false));
  assert.ok(skills.every((entry) => entry.supportedDataClasses.includes("enterprise")));
  assert.ok(skills.every((entry) => Object.isFrozen(entry)));
});

test("progressive disclosure returns only the detail requested", () => {
  const summary = getExpertSkill("accounting-cpa");
  assert.equal("competencies" in summary, false);
  assert.equal("qualityGates" in summary, false);
  assert.deepEqual(summary.nextDisclosureLevels, ["competencies", "full"]);

  const competencies = getExpertSkill("accounting-cpa", { level: "competencies" });
  assert.equal(competencies.competencies.length, 3);
  assert.ok(competencies.competencies.every((entry) => entry.observableOutcome && entry.acceptedEvidence.length >= 2));
  assert.equal("qualityGates" in competencies, false);
  assert.deepEqual(competencies.nextDisclosureLevels, ["full"]);

  const full = getExpertSkill("accounting-cpa", { level: "full" });
  assert.ok(full.qualityGates.length >= 3);
  assert.ok(full.escalationTriggers.length >= 2);
  assert.ok(full.authoritativeSources.length >= 2);
  assert.match(full.professionalBoundary, /does not claim CPA licensure/i);
  assert.deepEqual(full.nextDisclosureLevels, []);
});

test("enterprise disclosure fails closed for persistence and cloud transfer", () => {
  for (const entry of listExpertSkills()) {
    const full = getExpertSkill(entry.id, { level: "full" });
    assert.equal(full.enterprisePolicy.gitContentAllowed, false);
    assert.equal(full.enterprisePolicy.runtimeDatabaseContentAllowed, false);
    assert.equal(full.enterprisePolicy.githubCoordinationContentAllowed, false);
    assert.equal(full.enterprisePolicy.cloudTransfer, "explicit-opt-in-and-provider-eligible-only");
    assert.match(full.enterprisePolicy.receiptContent, /hashes-counts-status/);
    assert.ok(full.evidenceRequirements.every((requirement) => !/document content|model response/i.test(requirement)));
  }
});

test("expert selection is deterministic, bounded, and data-class aware", () => {
  const first = selectExpertSkills({ domains: ["accounting"], terms: ["reconciliation", "data quality"], dataClass: "enterprise", limit: 2 });
  const second = selectExpertSkills({ domains: ["accounting"], terms: ["reconciliation", "data quality"], dataClass: "enterprise", limit: 2 });
  assert.deepEqual(first, second);
  assert.equal(first.dataClass, "enterprise");
  assert.equal(first.matches[0].id, "accounting-cpa");
  assert.ok(first.matches.some((entry) => entry.id === "data-analytics"));
  assert.equal(first.enterprisePolicy.gitContentAllowed, false);
  assert.equal(Object.isFrozen(first), true);
});

test("registry rejects invented skills and malformed selection inputs", () => {
  assert.equal(getExpertSkill("legal-counsel"), null);
  assert.throws(() => getExpertSkill("../accounting-cpa"), /id is invalid/);
  assert.throws(() => getExpertSkill("accounting-cpa", { level: "everything" }), /disclosure level/);
  assert.throws(() => selectExpertSkills(), /requires bounded/);
  assert.throws(() => selectExpertSkills({ domains: ["accounting"], dataClass: "public" }), /data class/);
  assert.throws(() => selectExpertSkills({ domains: ["accounting"], limit: 10 }), /limit/);
  assert.throws(() => selectExpertSkills({ prompt: "x" }), /prompt/);
  assert.throws(() => selectExpertSkills({ prompt: "x".repeat(2001) }), /prompt/);
});

test("realistic prompts select observable cross-domain skills without preassigned routing", () => {
  const cases = [
    {
      prompt: "Review the SharePoint Visio flowchart for SOX controls, trace each risk to the RACM, verify connector completeness, and report control design gaps with evidence.",
      dataClass: "enterprise",
      expected: ["internal-audit-cia"],
    },
    {
      prompt: "Reconcile the August general ledger to the subledger and explain a $428,000 unexplained variance; identify whether it is a data-quality issue or a potential misstatement.",
      dataClass: "enterprise",
      expected: ["accounting-cpa", "data-analytics"],
    },
    {
      prompt: "The AI agent router keeps selecting an unavailable cloud provider instead of the healthy local worker. Diagnose the defect, patch it, and add regression tests without changing external interfaces.",
      dataClass: "local-only",
      expected: ["ai-engineering", "programming"],
    },
    {
      prompt: "Replace significant in this audit finding with a more precise word that conveys the issue is consequential but not pervasive; explain the nuance and preserve the conclusion.",
      dataClass: "synthetic",
      expected: ["writing-precision", "internal-audit-cia"],
    },
  ];
  for (const item of cases) {
    const result = selectExpertSkills({ prompt: item.prompt, dataClass: item.dataClass, limit: 3 });
    assert.equal(result.matches[0]?.id, item.expected[0], "most relevant skill should rank first");
    for (const expected of item.expected) assert.ok(result.matches.some((entry) => entry.id === expected), expected + " was not selected");
    if (item.dataClass === "enterprise") assert.equal(result.enterprisePolicy.githubCoordinationContentAllowed, false);
    for (const selected of result.matches) {
      const full = getExpertSkill(selected.id, { level: "full" });
      assert.equal(full.credentialClaim, false);
      assert.ok(full.evidenceRequirements.length >= 3);
      assert.ok(full.qualityGates.length >= 3);
    }
  }
});

test("regulated-domain profiles state assistance boundaries rather than credentials", () => {
  for (const id of ["accounting-cpa", "it-audit-cisa", "management-accounting-cgma", "internal-audit-cia"]) {
    const profile = getExpertSkill(id, { level: "full" });
    assert.equal(profile.credentialClaim, false);
    assert.match(profile.professionalBoundary, /does not claim/i);
    assert.doesNotMatch(profile.professionalBoundary, /is (?:a|an) (?:CPA|CISA|CGMA|CIA)/i);
  }
});
