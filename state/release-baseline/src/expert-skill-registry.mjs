const DATA_CLASSES = new Set(["synthetic", "personal", "enterprise", "local-only"]);
const DISCLOSURE_LEVELS = new Set(["summary", "competencies", "full"]);

const ENTERPRISE_POLICY = Object.freeze({
  boundary: "microsoft-tenant-or-owner-approved-local-enterprise-workspace",
  gitContentAllowed: false,
  runtimeDatabaseContentAllowed: false,
  githubCoordinationContentAllowed: false,
  cloudTransfer: "explicit-opt-in-and-provider-eligible-only",
  receiptContent: "hashes-counts-status-and-source-classes-only",
});

const COMMON_EVIDENCE = Object.freeze([
  "Identify the authoritative source class and its as-of date.",
  "Separate observed facts, calculations, assumptions, and professional judgment.",
  "Tie conclusions to reproducible checks or bounded evidence references.",
]);

const SKILLS = [
  skill({
    id: "computer-engineering",
    title: "Computer Engineering",
    domain: "computer-engineering",
    summary: "Analyze computer systems across hardware, operating-system, network, reliability, and security boundaries.",
    activationTerms: ["computer architecture", "hardware", "operating system", "network", "performance", "reliability"],
    professionalBoundary: "Engineering analysis support only; no professional-engineer or vendor-certification claim.",
    competencies: [
      competency("system-decomposition", "Produce a component and interface map with explicit trust, data, and failure boundaries.", ["component inventory", "interface map", "boundary risks"]),
      competency("performance-reliability", "Form a measurable bottleneck or failure hypothesis and test it with reproducible observations.", ["baseline metrics", "test conditions", "before-and-after evidence"]),
      competency("secure-configuration", "Compare the observed configuration with authoritative platform guidance and identify bounded corrections.", ["observed settings", "primary-source guidance", "risk-ranked variance"]),
    ],
    qualityGates: ["Reproduce the observed state before recommending a change.", "Keep hardware, software, network, and identity causes distinct.", "Require rollback or recovery evidence for system changes."],
    escalationTriggers: ["physical safety impact", "privileged firmware change", "unsupported hardware modification", "material production outage risk"],
    authoritativeSources: ["manufacturer documentation", "operating-system documentation", "protocol standards", "measured system evidence"],
  }),
  skill({
    id: "accounting-cpa",
    title: "Accounting and Financial Reporting (CPA-informed)",
    domain: "accounting",
    summary: "Perform evidence-led accounting analysis, reconciliations, financial-reporting support, and control-aware workpapers.",
    activationTerms: ["accounting", "financial reporting", "reconciliation", "reconcile", "general ledger", "subledger", "journal entry", "misstatement", "gaap", "ifrs", "cpa"],
    professionalBoundary: "CPA-informed assistance only; Mahoraga does not claim CPA licensure, issue an audit opinion, or provide an attestation.",
    competencies: [
      competency("account-reconciliation", "Reconcile source records to ledger or report totals and explain every material difference.", ["source totals", "recalculation", "difference disposition"]),
      competency("technical-accounting", "Map a transaction or balance to the applicable, currently verified accounting framework and document alternatives.", ["fact pattern", "authoritative framework reference", "conclusion and alternatives"]),
      competency("workpaper-quality", "Produce a reviewer-ready workpaper with purpose, source, procedure, result, and conclusion.", ["prepared-by evidence", "cross-references", "review exceptions"]),
    ],
    qualityGates: ["Recalculate rather than trust displayed totals.", "Confirm entity, period, currency, and accounting framework.", "Flag estimates, management judgments, and unresolved differences."],
    escalationTriggers: ["audit opinion or attestation", "tax or legal advice", "material misstatement indication", "management representation required"],
    authoritativeSources: ["applicable accounting standards setter", "regulator or filing authority", "entity accounting policy", "source-to-ledger evidence"],
  }),
  skill({
    id: "it-audit-cisa",
    title: "Information Systems Audit (CISA-informed)",
    domain: "it-audit",
    summary: "Assess technology governance, access, change, operations, resilience, and evidence quality using risk-based audit methods.",
    activationTerms: ["it audit", "cisa", "access control", "change management", "itgc", "cybersecurity", "resilience"],
    professionalBoundary: "CISA-informed assistance only; Mahoraga does not claim CISA certification or sign an audit report.",
    competencies: [
      competency("risk-control-mapping", "Map a stated technology risk to control objectives, activities, owners, frequency, and evidence.", ["risk statement", "control design", "evidence expectation"]),
      competency("itgc-testing", "Design or execute a bounded test of access, change, operations, or resilience controls with a defined population and exceptions.", ["population source", "sample rationale", "test results and exceptions"]),
      competency("evidence-reliability", "Assess completeness, accuracy, provenance, and reproducibility of system-generated audit evidence.", ["generation method", "parameter evidence", "completeness and accuracy checks"]),
    ],
    qualityGates: ["Distinguish design, implementation, and operating effectiveness.", "Preserve population and sampling lineage.", "Do not infer control operation from policy text alone."],
    escalationTriggers: ["active compromise", "privileged-access anomaly", "evidence tampering", "scope limitation affecting conclusion"],
    authoritativeSources: ["current ISACA guidance", "applicable security standards", "system-of-record evidence", "approved audit methodology"],
  }),
  skill({
    id: "management-accounting-cgma",
    title: "Management Accounting (CGMA-informed)",
    domain: "management-accounting",
    summary: "Support planning, costing, forecasting, performance management, and decision analysis with transparent assumptions.",
    activationTerms: ["management accounting", "cgma", "forecast", "budget", "costing", "variance", "business case"],
    professionalBoundary: "CGMA-informed assistance only; Mahoraga does not claim the CGMA designation or replace accountable management judgment.",
    competencies: [
      competency("planning-forecasting", "Build or review a driver-based plan with explicit assumptions, scenarios, and sensitivity.", ["driver definitions", "scenario logic", "actual-to-plan comparison"]),
      competency("cost-profitability", "Trace costs and economics to products, customers, channels, or decisions without hiding allocation choices.", ["cost pools", "allocation bases", "profitability bridge"]),
      competency("decision-support", "Compare alternatives using relevant cash flows, constraints, risks, and nonfinancial considerations.", ["option set", "decision model", "sensitivity and recommendation"]),
    ],
    qualityGates: ["Separate controllable performance from volume, mix, price, and timing effects.", "Reconcile management views to governed financial sources.", "Show sensitivity to material assumptions."],
    escalationTriggers: ["unapproved forecast commitment", "capital authorization", "material incentive conflict", "unreconciled management metric"],
    authoritativeSources: ["approved planning methodology", "governed finance data", "current AICPA-CIMA guidance", "management-approved assumptions"],
  }),
  skill({
    id: "internal-audit-cia",
    title: "Internal Audit (CIA-informed)",
    domain: "internal-audit",
    summary: "Plan and execute risk-based internal-audit work with traceable criteria, evidence, findings, and action validation.",
    activationTerms: ["internal audit", "cia", "sox", "racm", "risk assessment", "control design", "control review", "control testing", "audit finding", "finding", "remediation", "assurance"],
    professionalBoundary: "CIA-informed assistance only; Mahoraga does not claim CIA certification, engagement responsibility, or independent assurance authority.",
    competencies: [
      competency("engagement-planning", "Translate objectives and risks into a scoped work program with criteria and evidence needs.", ["risk assessment", "scope rationale", "test program"]),
      competency("finding-development", "Develop a supported observation using criteria, condition, cause, effect, and agreed action ownership.", ["criteria source", "condition evidence", "cause and impact analysis"]),
      competency("remediation-validation", "Validate whether corrective action addresses the cause and operates as intended.", ["action evidence", "retest procedure", "closure conclusion"]),
    ],
    qualityGates: ["Maintain evidence-to-conclusion traceability.", "Distinguish advisory observations from assurance conclusions.", "Assess significance consistently and disclose scope limitations."],
    escalationTriggers: ["fraud indicator", "independence impairment", "senior-management override", "legal or regulatory reporting question"],
    authoritativeSources: ["current IIA standards and guidance", "approved internal-audit methodology", "governance criteria", "engagement evidence"],
  }),
  skill({
    id: "data-analytics",
    title: "Data Analytics",
    domain: "data-analytics",
    summary: "Turn governed data into reproducible profiles, reconciliations, metrics, diagnostics, and decision-ready analysis.",
    activationTerms: ["data analytics", "sql", "statistics", "dashboard", "metric", "data quality", "visualization"],
    professionalBoundary: "Analytical support with explicit uncertainty; no claim that a model or correlation establishes causation.",
    competencies: [
      competency("data-quality", "Profile completeness, validity, uniqueness, consistency, timeliness, and reconciliation before analysis.", ["row and key counts", "quality exceptions", "source reconciliation"]),
      competency("reproducible-analysis", "Produce a rerunnable transformation and calculation chain from source to conclusion.", ["query or formula lineage", "parameter record", "result checks"]),
      competency("decision-communication", "Choose an honest comparison and visualization and state the decision implication with uncertainty.", ["metric definition", "chart or table", "caveat and action"]),
    ],
    qualityGates: ["Validate grains, joins, filters, denominators, and time windows.", "Reconcile analytical totals to governed sources.", "Label uncertainty, missingness, and noncausal relationships."],
    escalationTriggers: ["materially conflicting sources", "sensitive attribute use", "unreconciled executive metric", "high-stakes predictive decision"],
    authoritativeSources: ["governed source definitions", "data contracts", "reproducible query evidence", "current statistical methodology"],
  }),
  skill({
    id: "programming",
    title: "Software Engineering and Programming",
    domain: "programming",
    summary: "Design, implement, debug, test, and maintain software through bounded, reviewable changes.",
    activationTerms: ["programming", "software engineering", "debug", "defect", "patch", "refactor", "regression test", "test", "api", "database"],
    professionalBoundary: "Engineering execution remains constrained by repository policy, granted tools, and user-reserved deployment boundaries.",
    competencies: [
      competency("codebase-reasoning", "Trace behavior through the smallest relevant code path and identify the actual failure or extension point.", ["reproduction", "source trace", "cause statement"]),
      competency("bounded-implementation", "Implement a coherent minimal change that preserves existing contracts and unrelated work.", ["focused diff", "compatibility evidence", "rollback path"]),
      competency("verification", "Test the changed behavior and relevant boundary conditions at the narrowest meaningful level.", ["targeted tests", "static checks", "observed result"]),
    ],
    qualityGates: ["Reproduce defects before fixing when practical.", "Test error paths and security boundaries, not only happy paths.", "Do not claim deployment success without live deployment evidence."],
    escalationTriggers: ["destructive migration", "credential boundary change", "public exposure", "core self-update activation"],
    authoritativeSources: ["repository contracts and tests", "official language or framework documentation", "runtime evidence", "version-control history"],
  }),
  skill({
    id: "ai-engineering",
    title: "AI Engineering",
    domain: "ai-engineering",
    summary: "Design and evaluate bounded AI systems with explicit data, model, tool, cost, safety, and fallback contracts.",
    activationTerms: ["ai engineering", "llm", "ai agent", "agent", "router", "routing", "prompt", "retrieval", "evaluation", "model routing"],
    professionalBoundary: "AI outputs remain untrusted until validated; this skill does not imply model sentience, infallibility, or autonomous authority.",
    competencies: [
      competency("system-contracts", "Define model, tool, retrieval, memory, authorization, and failure boundaries before implementation.", ["architecture contract", "data flow", "authority matrix"]),
      competency("evaluation", "Create representative success, failure, safety, privacy, latency, and cost evaluations tied to acceptance criteria.", ["evaluation cases", "measured results", "failure analysis"]),
      competency("production-operations", "Instrument an AI workflow for observability, bounded retries, fallback, and human escalation.", ["trace fields", "retry policy", "fallback and escalation evidence"]),
    ],
    qualityGates: ["Use deterministic or local execution before paid models when fit is equivalent.", "Evaluate groundedness and tool effects independently from fluent wording.", "Keep secrets and enterprise content outside prompts unless the provider is explicitly eligible."],
    escalationTriggers: ["new privileged tool", "sensitive-data model transfer", "unbounded autonomous loop", "high-stakes automated decision"],
    authoritativeSources: ["official model and SDK documentation", "provider security and data-use terms", "evaluation results", "system telemetry"],
  }),
  skill({
    id: "writing-precision",
    title: "Writing Precision and Thesaurus",
    domain: "writing",
    summary: "Improve terminology, structure, tone, and semantic precision without changing supported meaning.",
    activationTerms: ["writing", "edit", "replace", "thesaurus", "word choice", "precise word", "wording", "nuance", "preserve meaning", "rewrite", "tone", "clarity"],
    professionalBoundary: "Language refinement preserves source meaning and cannot manufacture evidence, certainty, or professional conclusions.",
    competencies: [
      competency("semantic-word-choice", "Select terms by intended meaning, register, connotation, and domain usage rather than superficial synonymy.", ["intended meaning", "candidate distinctions", "selected wording"]),
      competency("structural-editing", "Reorganize content so the answer, evidence, caveats, and requested action are easy to locate.", ["audience and purpose", "before-and-after structure", "meaning-preservation check"]),
      competency("precision-review", "Remove ambiguity, unsupported intensifiers, hidden actors, and inconsistent terminology.", ["defined terms", "claim-strength check", "ambiguity review"]),
    ],
    qualityGates: ["Do not alter numbers, citations, obligations, or conclusions without explicit support.", "Use domain-specific terms consistently.", "Distinguish factual correction from stylistic preference."],
    escalationTriggers: ["legal-language interpretation", "regulated disclosure", "material change in commitment", "source contradiction"],
    authoritativeSources: ["user-provided style guide", "domain glossary", "authoritative dictionary", "source document"],
  }),
];

const INDEX = new Map(SKILLS.map((entry) => [entry.id, entry]));

export function listExpertSkills() {
  return SKILLS.map((entry) => disclose(entry, "summary"));
}

export function getExpertSkill(id, { level = "summary" } = {}) {
  if (typeof id !== "string" || !/^[a-z][a-z0-9-]{1,63}$/.test(id)) throw new TypeError("Expert skill id is invalid.");
  if (!DISCLOSURE_LEVELS.has(level)) throw new TypeError("Expert skill disclosure level is invalid.");
  const entry = INDEX.get(id);
  if (!entry) return null;
  return disclose(entry, level);
}

export function selectExpertSkills({ domains = [], terms = [], prompt = null, dataClass = "synthetic", limit = 3 } = {}) {
  if (!DATA_CLASSES.has(dataClass)) throw new TypeError("Expert skill data class is invalid.");
  if (!Array.isArray(domains) || !Array.isArray(terms)) throw new TypeError("Expert skill selection inputs are invalid.");
  if (!Number.isInteger(limit) || limit < 1 || limit > 9) throw new TypeError("Expert skill selection limit is invalid.");
  const requested = [...domains, ...terms].map(normalizeTerm);
  if (requested.some((value) => value.length < 2 || value.length > 80)) throw new TypeError("Expert skill selection domains or terms are invalid.");
  if (prompt !== null && (typeof prompt !== "string" || prompt.trim().length < 2 || prompt.length > 2000)) throw new TypeError("Expert skill selection prompt is invalid.");
  const normalizedPrompt = prompt === null ? null : normalizeTerm(prompt);
  if (requested.length === 0 && normalizedPrompt === null) throw new TypeError("Expert skill selection requires bounded domains, terms, or a prompt.");
  const matches = SKILLS.map((entry) => ({ entry, score: score(entry, requested, normalizedPrompt) }))
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score || left.entry.id.localeCompare(right.entry.id))
    .slice(0, limit)
    .map(({ entry }) => disclose(entry, "summary"));
  return deepFreeze({ dataClass, enterprisePolicy: dataClass === "enterprise" ? ENTERPRISE_POLICY : null, matches });
}

export function validateExpertSkillRegistry() {
  if (SKILLS.length !== 9 || INDEX.size !== SKILLS.length) throw new TypeError("Expert skill registry identity is invalid.");
  for (const entry of SKILLS) {
    bounded(entry.id, 64, "skill id"); bounded(entry.title, 100, "skill title"); bounded(entry.summary, 300, "skill summary");
    if (entry.credentialClaim !== false || entry.competencies.length < 3) throw new TypeError("Expert skill competency boundary is invalid.");
    for (const item of entry.competencies) {
      bounded(item.id, 64, "competency id"); bounded(item.observableOutcome, 300, "observable outcome");
      if (item.acceptedEvidence.length < 2) throw new TypeError("Expert skill evidence is incomplete.");
    }
    if (entry.qualityGates.length < 3 || entry.escalationTriggers.length < 2 || entry.authoritativeSources.length < 2) throw new TypeError("Expert skill quality contract is incomplete.");
  }
  return deepFreeze({ schemaVersion: 1, skillCount: SKILLS.length, valid: true });
}

function skill(value) {
  return deepFreeze({
    ...value,
    credentialClaim: false,
    supportedDataClasses: ["synthetic", "personal", "enterprise", "local-only"],
    enterprisePolicy: ENTERPRISE_POLICY,
    evidenceRequirements: COMMON_EVIDENCE,
  });
}

function competency(id, observableOutcome, acceptedEvidence) {
  return { id, observableOutcome, acceptedEvidence };
}

function disclose(entry, level) {
  const summary = {
    id: entry.id, title: entry.title, domain: entry.domain, summary: entry.summary,
    activationTerms: entry.activationTerms, credentialClaim: false,
    supportedDataClasses: entry.supportedDataClasses,
    nextDisclosureLevels: level === "summary" ? ["competencies", "full"] : level === "competencies" ? ["full"] : [],
  };
  if (level === "summary") return deepFreeze(summary);
  const competencies = { ...summary, competencies: entry.competencies, evidenceRequirements: entry.evidenceRequirements };
  if (level === "competencies") return deepFreeze(competencies);
  return deepFreeze({
    ...competencies,
    qualityGates: entry.qualityGates,
    escalationTriggers: entry.escalationTriggers,
    authoritativeSources: entry.authoritativeSources,
    professionalBoundary: entry.professionalBoundary,
    enterprisePolicy: entry.enterprisePolicy,
  });
}

function score(entry, requested, prompt) {
  const exact = new Set([entry.id, entry.domain, normalizeTerm(entry.title), ...entry.activationTerms.map(normalizeTerm)]);
  const declaredScore = requested.reduce((total, term) => total + (exact.has(term) ? 10 : [...exact].some((candidate) => candidate.includes(term) || term.includes(candidate)) ? 2 : 0), 0);
  if (prompt === null) return declaredScore;
  const promptScore = [...exact].reduce((total, candidate) => {
    if (!containsPhrase(prompt, candidate)) return total;
    return total + (candidate.includes(" ") ? 6 : candidate.length >= 5 ? 3 : 1);
  }, 0);
  return declaredScore + promptScore;
}

function containsPhrase(source, phrase) {
  const padded = " " + source.replace(/[^a-z0-9]+/g, " ").trim() + " ";
  const needle = " " + phrase.replace(/[^a-z0-9]+/g, " ").trim() + " ";
  return padded.includes(needle);
}

function normalizeTerm(value) {
  if (typeof value !== "string") throw new TypeError("Expert skill selection term is invalid.");
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function bounded(value, maximum, label) {
  if (typeof value !== "string" || value.length < 1 || value.length > maximum) throw new TypeError(`Expert ${label} is invalid.`);
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

validateExpertSkillRegistry();
