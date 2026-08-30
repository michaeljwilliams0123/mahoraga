# Mahoraga Sovereign Reasoning and Break-Glass Administration Design

**Status:** Approved by the owner on 2026-08-29, including the zero-credit autonomy addendum
**Repository baseline:** `ec81509e9fc14858745af0caed1ffe1753d557bc`
**Release posture:** Staged candidate only until every acceptance gate passes
**Normal operator:** Mahoraga
**Last-resort administrator:** `primary-local-codex` holding the `king-admin` break-glass role

## Purpose

Mahoraga must become the owner's normal interface for reasoning, project coordination, and bounded execution while the owner works on other projects. ChatGPT Work and Codex must not remain required front doors or everyday orchestration layers. They become optional providers behind Mahoraga. Codex receives a dormant, auditable `king-admin` role for last-resort diagnosis, repair, and recovery when Mahoraga's normal local and domain-native paths cannot complete an authorized objective.

The same phase adds a provider-neutral divergent-convergent reasoning engine. Mahoraga should generate useful hypotheses and cross-domain connections, challenge them, and converge on a supported answer without allowing speculative thought to create execution authority.

## Outcomes

The phase is successful when:

1. The owner can submit, monitor, pause, resume, and review projects through Mahoraga without opening ChatGPT Work or Codex.
2. Normal objectives use deterministic workers, approved domain-native providers, or a verified local reasoner before any Codex fallback.
3. Mahoraga can develop multiple hypotheses, connect relevant concepts across expert domains, test alternative explanations, and return an answer-first synthesis with calibrated uncertainty.
4. Raw prompts, model responses, private reasoning traces, credentials, and document content do not enter GitHub coordination records, receipts, or the operational database.
5. `king-admin` is dormant during healthy operation, activates only under the contract below, expires automatically, and cannot bypass reserved owner or platform boundaries.
6. Speculation cannot directly call tools, mutate state, dispatch workers, or authorize actions.

## Sovereign operating model

Mahoraga owns intake, policy derivation, planning, provider selection, evidence evaluation, background progress, and final presentation. Client surfaces are replaceable views over the loopback API; they do not own orchestration authority.

Provider preference is:

1. Deterministic local computation and existing isolated workers.
2. A verified local reasoning provider through a transient, non-persisting result channel.
3. An approved domain-native provider in the correct data plane, including Microsoft-tenant execution for enterprise data.
4. Bounded Codex execution for implementation tasks that already match an approved task-area contract.
5. `king-admin` Codex as the final recovery lane.

ChatGPT Work is not a runtime dependency. Codex authentication, availability, quota, or product UI failure must degrade the last-resort lane without stopping ordinary Mahoraga work.

### Background project operation

Mahoraga maintains a project registry containing exact project roots, data classification, permitted workers, execution plane, cost ceiling, concurrency ceiling, notification policy, and reserved actions. Each background objective is durable and resumable. It uses bounded retries, checkpoints, leases, and append-only status evidence.

Background operation may continue without conversational prompts while it remains inside the registered project contract. Mahoraga pauses and surfaces a concise decision request when work would cross a reserved action, consume a new credential, transfer data to a new plane, exceed a budget, or perform an irreversible external effect.

## `king-admin` break-glass contract

`king-admin` is a role granted to the authenticated `primary-local-codex` execution lane, not to an arbitrary model, prompt, process, or caller. It is more capable than ordinary workers but is not unrestricted administrator access.

### Activation

The role may activate through either:

- an explicit owner request naming the incident or objective; or
- an automatic last-resort escalation for a preauthorized local project after normal providers exhaust their bounded failure budget and Mahoraga still has a healthy policy, lease, receipt, and rollback path.

Automatic activation is prohibited if the policy engine, audit ledger, authentication boundary, release baseline, or rollback mechanism is itself untrusted. That condition fails closed and requires the owner.

### Lease

Every activation creates one immutable lease:

```json
{
  "schemaVersion": 1,
  "role": "king-admin",
  "controllerId": "primary-local-codex",
  "incidentId": "inc-550e8400-e29b-41d4-a716-446655440000",
  "objectiveId": "obj-6ba7b810-9dad-41d1-80b4-00c04fd430c8",
  "allowedProjectRoots": ["project-mahoraga-v2"],
  "allowedCapabilities": ["repository.inspect", "codex.execute", "repository.verify", "repair.apply"],
  "reservedActions": ["owner-required"],
  "issuedAt": "2026-08-29T19:30:00.000Z",
  "expiresAt": "2026-08-29T20:00:00.000Z",
  "maximumAttempts": 1,
  "rollbackRequired": true
}
```

The maximum lease duration is 30 minutes. Only one `king-admin` lease may exist. It cannot be renewed implicitly, delegated, widened by a worker, or reused for another incident.

### Permitted actions

Within its lease, `king-admin` may:

- inspect bounded runtime, repository, configuration, and receipt evidence;
- diagnose an incident and produce alternative repair hypotheses;
- create an isolated candidate worktree;
- modify only lease-authorized project paths;
- run deterministic verification and adversarial tests;
- create a rollback checkpoint and verified candidate receipt;
- submit the candidate to Mahoraga's existing verified automatic local activation policy when the lease explicitly covers core repair.

### Reserved owner and platform boundaries

`king-admin` may not:

- expose a public listener, inbound tunnel, remote desktop, or externally reachable control surface;
- read, emit, copy, or persist credentials, secrets, browser history, private chats, raw model output, or unrelated files;
- transfer enterprise data outside the Microsoft tenant or local-only data off the device;
- change tenant permissions, repository visibility, branch protection, billing, financial transactions, or third-party account access;
- bypass UAC, operating-system authorization, endpoint security, or provider authentication;
- perform destructive deletion, irreversible publication, or another reserved external action without active owner authorization;
- disable, rewrite, or evade its lease, receipts, audit ledger, verification gates, checkpoint, or rollback.

## Divergent-convergent reasoning architecture

### 1. Question model

`buildQuestionModel()` converts an authorized intent into a bounded structure:

```js
{
  objective,
  dataClass,
  facts,
  assumptions,
  unknowns,
  constraints,
  tensions,
  successCriteria,
  selectedExpertIds,
  evidenceRefs
}
```

Facts require evidence references. Assumptions and unknowns are never promoted to facts by repetition.

### 2. Expert mesh

The existing expert registry remains canonical. A new composition layer selects up to five relevant experts and declares why each contributes. Selection considers direct relevance, complementary methods, likely blind spots, data eligibility, and redundancy. It must be capable of choosing a useful adjacent domain even when the prompt lacks that domain's exact keywords.

### 3. Divergence

`generateReasoningCandidates()` produces three to seven bounded candidates covering multiple reasoning modes:

- direct explanation;
- causal hypothesis;
- alternative explanation;
- analogy or cross-domain transfer;
- constraint interaction;
- counterfactual;
- failure or risk hypothesis.

Each candidate contains a concise claim, reasoning mode, contributing experts, supporting evidence references, assumptions, disconfirming evidence needed, confidence, novelty, relevance, and an explicit `speculative` flag. Candidate generation has fixed token, time, cost, and count budgets.

### 4. Connection graph

`buildConnectionGraph()` creates bounded nodes for concepts, evidence, assumptions, and candidates. Allowed edge types are `supports`, `contradicts`, `causes`, `depends-on`, `analogous-to`, `precedes`, `shares-constraint`, and `explains`. Graph construction must reject unknown edge types, orphan evidence, cycles falsely presented as causation, and unsupported fact promotion.

### 5. Adversarial reflection

`critiqueReasoningCandidates()` checks each candidate for contradictory evidence, circularity, unsupported causation, hidden data-plane changes, authority assumptions, duplicated ideas, and plausible alternatives. At least one counterexample or falsification condition is required for a high-confidence inferred claim.

### 6. Convergence

`synthesizeReasoningDecision()` ranks surviving candidates using relevance, evidence strength, explanatory coverage, nonredundancy, calibrated novelty, and action safety. The result contains:

- the answer first;
- the strongest supported connections;
- material alternatives;
- uncertainties and disconfirming evidence;
- recommended next observations or actions;
- a compact evidence map.

The user receives concise rationale cards, not raw hidden chain-of-thought or private provider transcripts.

### 7. Execution firewall

Reasoning output is advisory. `deriveExecutableDecision()` is the only bridge to the task router. It accepts a converged result only when:

- the requested action already falls within derived task policy;
- required evidence and readiness are verified and fresh;
- the candidate is not marked speculative;
- data class and execution plane match;
- attended, integration, or `king-admin` leases are valid at dispatch time;
- the action is not reserved for the owner.

Failure returns an explanation and next evidence requirement. It does not optimistically dispatch.

## Provider contract

Reasoning providers implement one interface and do not receive execution authority:

```js
await provider.reason({
  schemaVersion: 1,
  objective,
  dataClass,
  mode,
  boundedContext,
  evidenceRefs,
  maximumCandidates,
  deadlineAt
});
```

Providers return validated candidate structures through a transient channel. Provider output is untrusted until schema, content-boundary, and evidence checks pass. A provider cannot select tools, workers, execution planes, or authority roles.

The first implementation supports a deterministic test provider and a provider adapter boundary. A local model becomes primary only after its exact transient result canary passes. Codex is not used by default merely because it is available.

## Content and memory boundary

Until the encrypted content-vault migration is safely integrated, reasoning context and provider output remain in memory and expire at objective completion or timeout. The operational database may persist only:

- objective and incident identifiers;
- provider and reasoning-mode identifiers;
- counts, timestamps, status, confidence bands, and reason codes;
- hashes and opaque evidence references;
- the owner's final decision and bounded public-safe summary when explicitly permitted.

Raw prompts, candidate prose, provider responses, document content, private chats, and hidden reasoning traces are prohibited from operational tables, receipts, Git commits, GitHub issues, and pull requests.

Longer-term procedural memory stores validated methods and outcomes, not private thought traces. Content-bearing memory requires the completed encrypted-vault boundary and an explicit retention classification.

## Failure behavior

- No eligible reasoning provider: return `reasoning-provider-unavailable`; deterministic workers and existing projects continue.
- Provider timeout or malformed response: discard transient content, record a bounded failure code, and try the next eligible provider within budget.
- All candidates speculative: return uncertainty and requested observations; create no task.
- Contradictory evidence: preserve both alternatives and lower confidence.
- Data-plane mismatch: fail before provider invocation.
- Expired authority lease: revalidate and stop before dispatch.
- `king-admin` verification failure: roll back the candidate, revoke the lease, retain the incident receipt, and notify the owner.
- Audit, policy, or rollback integrity failure: prohibit automatic `king-admin` activation.

## Evaluation strategy

The release gate uses synthetic, content-free scenarios and mutation-resistant assertions. It measures:

- hidden but relevant cross-domain connection discovery;
- generation of materially distinct hypotheses;
- recovery of alternative causal explanations;
- counterfactual and contradiction handling;
- evidence/assumption separation;
- data-class and execution-plane compliance;
- refusal to execute speculative conclusions;
- local-first provider selection;
- Codex non-use during healthy normal operation;
- correct last-resort activation and expiry;
- zero raw reasoning content in the operational database, receipts, and GitHub artifacts.

The current deterministic expert selector and answer evaluator are the baseline. The new system must improve connection and alternative-explanation coverage without reducing groundedness, privacy, or action safety.

## Delivery phases

### Phase A: Sovereign contracts

Add project registry, reasoning-provider interface, `king-admin` lease schema, activation policy, execution firewall, and bounded metadata receipts. No model execution is enabled.

### Phase B: Transient reasoning core

Add question modeling, expert composition, divergence, connection graph, critique, convergence, and deterministic synthetic providers. Expose reasoning through authenticated loopback Mahoraga APIs and the Control Center.

### Phase C: Local-first provider

Implement the transient LM Studio result channel, capability-specific canary, timeout, redaction, and graceful degradation. Enable it only after live readiness and content-boundary verification.

### Phase D: Background project operation

Add registered project portfolios, resumable objective checkpoints, budgets, progress summaries, and owner-decision queues so Mahoraga can continue bounded work while the owner changes projects.

### Phase E: Last-resort Codex

Integrate `king-admin` activation only after normal-provider exhaustion tests, lease enforcement, isolated candidate execution, exact path checks, rollback drills, and audit-integrity tests pass.

## Acceptance criteria

- Mahoraga is the normal project and reasoning interface.
- ChatGPT Work and Codex are absent from healthy-path requirements.
- Expert composition discovers relevant adjacent domains without keyword-only dependence.
- Every inferred connection retains its evidence, assumptions, confidence, and falsification condition.
- Speculative candidates never reach the task router.
- Reasoning is provider-neutral, local-first, bounded, and transient by default.
- Background objectives resume safely after restart and stop at reserved actions.
- `king-admin` is single-holder, incident-bound, maximum 30 minutes, one attempt, and rollback-required.
- Automatic `king-admin` activation occurs only inside preauthorized local scopes with healthy policy, audit, and rollback controls.
- No authority role can override privacy, data-plane, public-exposure, credential, operating-system, or irreversible-action boundaries.
- Full verification, adversarial evaluation, inactive-runtime smoke, and rollback drill pass before activation.

## Non-goals

- Model sentience, personality simulation, or unrestricted self-direction.
- Persistent storage of raw chain-of-thought or provider transcripts.
- A generic unrestricted shell or caller-selected executable path.
- Public remote control or inbound access to the local runtime.
- Replacing accountable user decisions in regulated, financial, credential, destructive, or irreversible actions.