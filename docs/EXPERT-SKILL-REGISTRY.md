# Mahoraga expert skill registry

Mahoraga's expert registry supplies reviewable working methods for nine domains.
It does not create credentialed personas. A skill is credible only when its
observable competencies and evidence requirements are satisfied in the work.

## Domains

| Skill | Observable work product | Professional boundary |
| --- | --- | --- |
| Computer Engineering | System map, measured diagnosis, configuration variance | No PE or vendor-certification claim |
| Accounting and Financial Reporting | Reconciliation, framework-supported analysis, reviewer-ready workpaper | CPA-informed; no licensure, opinion, or attestation claim |
| Information Systems Audit | Risk/control map, ITGC test, evidence-reliability assessment | CISA-informed; no certification or report-signing claim |
| Management Accounting | Driver forecast, cost/profitability bridge, decision model | CGMA-informed; no designation claim |
| Internal Audit | Risk-based work program, supported finding, remediation validation | CIA-informed; no certification or independent-assurance claim |
| Data Analytics | Quality profile, reproducible calculation chain, decision view | Uncertainty disclosed; correlation is not treated as causation |
| Software Engineering | Reproduction, bounded diff, targeted verification | Repository and deployment authority remain enforced |
| AI Engineering | System contract, evaluation suite, production fallback evidence | AI output remains untrusted until validated |
| Writing Precision and Thesaurus | Meaning-aware terminology, clear structure, precision review | Wording cannot manufacture evidence or certainty |

## Progressive disclosure

Consumers should load only the detail required for the current decision:

1. `listExpertSkills()` or `getExpertSkill(id)` returns compact discovery
   metadata. It is appropriate for routing and UI selection.
2. `getExpertSkill(id, { level: "competencies" })` adds observable outcomes and
   accepted evidence. Load this when planning or assigning the work.
3. `getExpertSkill(id, { level: "full" })` adds quality gates, escalation
   triggers, authoritative-source classes, professional boundaries, and the
   enterprise-data contract. Load it before execution or validation.

`selectExpertSkills()` performs deterministic selection from declared domains,
terms, or a bounded natural-language prompt. Prompt routing matches only the
registry's observable activation terms; it does not infer credentials or
silently invoke a model. Multiple
skills may be selected for a cross-domain objective, but one task owner remains
accountable for reconciling conflicts between their methods.

## Evidence and quality

Every domain requires the same evidence spine:

- identify the authoritative source class and as-of date;
- separate facts, calculations, assumptions, and judgment;
- connect conclusions to reproducible checks or bounded evidence references;
- run the domain-specific quality gates;
- escalate instead of overstating a conclusion when a listed trigger occurs.

For regulated or assurance-oriented work, the registry may organize evidence,
perform calculations, and draft analysis. It may not represent that Mahoraga or
its operator holds CPA, CISA, CGMA, CIA, PE, or other professional credentials.
It may not sign an opinion, attestation, audit report, or management decision.
Applicable standards and professional guidance must be checked against current
authoritative sources at the point of use.

## Enterprise-data boundary

Enterprise content remains in the Microsoft tenant or an owner-approved local
enterprise workspace. The registry stores methods, not client documents.

- No document content, prompts, or model responses enter SQLite.
- No enterprise content or document-derived narrative enters GitHub issues,
  assignments, branches, commits, pull requests, or coordination receipts.
- Git and GitHub may retain only code plus bounded hashes, counts, status,
  source classes, and verification references.
- Cloud transfer requires an explicit opt-in connector that is eligible for the
  task's data class. Private-repository visibility alone is not authorization to
  put enterprise documents in Git.
- Outputs containing enterprise content return to the approved tenant or local
  enterprise workspace; runtime receipts remain content-free.

## Integration boundary

The registry is repo-native deterministic source. Adding it does not enable a
worker, grant a provider access, consume credits, or activate a core update.
Runtime routing should reference skill IDs and disclosure levels in bounded task
metadata, then load the full contract inside an eligible worker before work.
Any runtime activation remains a separately verified, owner-controlled change.

