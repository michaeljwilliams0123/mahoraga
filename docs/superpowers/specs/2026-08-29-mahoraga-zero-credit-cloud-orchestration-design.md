# Mahoraga Zero-Credit Cloud Orchestration Design

**Status:** Approved by the owner on 2026-08-29, with credit-free operation as the absolute priority
**Repository baseline:** `291e4b3`
**Authoritative repository:** private GitHub repository `michaeljwilliams0123/mahoraga`
**Independent verifier:** private GitLab project `mahoraga_mw-group/Mahoraga_MW-project`
**Normal model-credit budget:** `0`
**Normal monetary compute ceiling:** `USD 0`

## Purpose

Mahoraga must improve registered projects on an eight-hour cadence without consuming ChatGPT, Codex, Copilot, OpenAI API, GitLab Duo, or another metered model credit. GitHub and GitLab provide durable cloud coordination and independent verification. Generative reasoning runs only through Mahoraga's verified local open-weight provider on a self-hosted runner. If that runner or provider is unavailable, model-dependent work waits without a paid fallback.

This design extends the approved sovereign-reasoning and zero-credit autonomy specifications. It does not replace the project registry, typed action kernel, execution firewall, checkpoints, rollback, data-plane rules, or `king-admin` contract.
Provider ordering is absolute: verified zero-dollar cloud inference, verified local open-weight inference, deterministic execution, then waiting. Mahoraga must sacrifice cadence, availability, model quality, and cloud-only operation before it consumes a model credit or paid compute.

The optional cloud-only profile uses an owner-provisioned GitHub Codespace as an ephemeral open-weight inference and execution sandbox. Codespaces is quota-bounded rather than unbounded; the profile starts only after current included usage and a zero-dollar stop limit are verified.


## Rejected elements from the supplied proposal

The following patterns are prohibited:

- automating the ChatGPT website, reverse-engineered chat clients, or browser session cookies;
- storing ChatGPT, GitHub, or GitLab session tokens in repository files, commits, artifacts, logs, or prompts;
- allowing model output to choose arbitrary shell commands, executables, arguments, roots, or working directories;
- committing prompts, raw reasoning, response transcripts, browser history, document content, or vector embeddings to a memory branch;
- pushing autonomous mutations directly to `main`;
- using public-repository visibility as a compute-financing mechanism;
- assuming hosted runner capacity, free-tier quotas, or third-party inference tiers are unlimited;
- describing Codespaces, Colab, Gitpod, or another subsidized service as unlimited, persistent, guaranteed, or a loophole;
- using Google Colab as an unattended distributed worker, remote shell, or web-UI automation host;
- treating unrestricted container root access as Mahoraga execution authority.
- silently falling back from a local model to a hosted model.

## Authority topology

### GitHub: authoritative control and integration ledger

GitHub `main` remains the sole source of release truth. GitHub stores source commits, candidate branches, pull requests, immutable workflow definitions, status checks, and content-free Mahoraga coordination records.

Only GitHub may integrate an accepted candidate into authoritative `main`. GitLab never pushes or merges GitHub `main`.

### GitLab: private mirror and independent assurance ledger

The GitLab project mirrors exact GitHub commits and runs read-only verification against the mirrored candidate SHA. It stores pipeline status and content-free assurance receipts. It does not originate autonomous objectives, modify candidate content, or become an alternate production source.

The initial one-commit GitLab repository is replaced by a controlled mirror bootstrap after the design and implementation plan are approved. Mirroring is performed outbound by the Mahoraga runner using locally protected Git credentials; no GitLab credential is stored in GitHub.

### Mahoraga self-hosted runner: normal execution authority

A dedicated self-hosted runner labeled for Mahoraga accepts only the repository's immutable scheduled workflow. It has outbound HTTPS access to GitHub, GitLab, approved research sources, and the loopback local reasoner. It exposes no inbound listener.

### Optional Codespaces cloud executor

When the owner enables `cloud-zero-credit`, a pre-provisioned personal GitHub Codespace may serve as the primary generative executor for a cycle. It is not authoritative and does not remain running between cycles.

The cloud dispatcher may start and stop the named Codespace only through GitHub's supported Codespaces lifecycle API using a locally or platform-protected fine-grained credential with `Codespaces lifecycle admin: write`. The credential never enters the model context, repository, artifacts, logs, GitLab, or receipts.

Before start, Mahoraga verifies:

- current Codespaces compute and storage usage are below registered soft limits;
- the account has a zero-dollar stop-usage budget and paid overage is unavailable;
- the exact repository, branch, dev-container digest, machine class, model artifact digest, and maximum runtime match the cloud provider registry;
- the requested cycle remains inside `normalCreditBudget: 0` and `hostedComputeSpendCeilingUsd: 0`.

Inside the Codespace:

- a pinned `llama.cpp`-compatible runtime serves one registry-owned quantized coding model over loopback;
- the model artifact is checksum-verified before use;
- Mahoraga exposes only typed project actions and registry-owned verification commands;
- Chromium may retrieve allowlisted primary documentation without authentication, session cookies, form submission, downloads outside the artifact contract, or external side effects;
- prompt, response, page content, and browser state remain transient;
- candidate work is pushed to its branch before shutdown;
- the Codespace is stopped in a terminal cleanup step.

Codespace storage is not trusted as durable state. Deleted, timed-out, quota-blocked, or unavailable Codespaces yield `cloud-zero-credit-unavailable`; Mahoraga then uses the verified local open-weight provider. If local inference is also unavailable, model-dependent work waits.

Google Colab is excluded from unattended execution because its free managed runtimes prioritize interactive notebooks, can terminate without warning, and prohibit remote-control or distributed-worker patterns without a positive compute-unit balance. Gitpod or another hosted development environment is ineligible until an equivalent supported lifecycle, quota, zero-dollar stop, isolation, and provider canary contract is implemented.


The runner invokes registry-owned command identifiers and typed project actions. It cannot accept a caller-selected shell command from an issue, prompt, model response, workflow input, or repository file.

### Codex and ChatGPT

Codex and ChatGPT are absent from normal routing. The existing Codex lanes are dormant for these cycles. `primary-local-codex` may operate only under a separately authorized, incident-bound `king-admin` lease and its exceptional consumption is reported outside normal zero-credit receipts.

## Eight-hour cycle

GitHub defines one UTC schedule at `17 */8 * * *`, plus an owner-only manual dispatch for recovery testing. Schedule delivery may be delayed by the platform; cadence is treated as an eight-hour eligibility window, not a real-time guarantee.

Each eligible window derives an idempotent cycle identifier from the repository identity and UTC window start. Repeated, delayed, or manually retried delivery reuses the same cycle until its terminal receipt exists.

The cycle state machine is:

1. **Wake:** acquire one fenced cycle lease; refuse overlap.
2. **Scan:** inspect the registered project, authoritative base SHA, open candidate state, plan checkboxes, test status, dependency/security alerts, and approved primary-source feeds.
3. **Synthesize:** build a bounded question model and expert mesh. Use the verified local reasoner only when synthesis requires generation.
4. **Understand:** separate evidence-backed facts, assumptions, unknowns, contradictions, and candidate connections.
5. **Research:** fetch only allowlisted primary sources through a bounded research capability. Content remains transient or uses the approved encrypted content boundary when available.
6. **Plan:** select one coherent objective that fits the registered paths, commands, duration, action count, data class, risk class, and zero-credit budget.
7. **Implement:** create an isolated worktree and use only `project.inspect`, `project.patch`, `project.verify`, and `workflow.run`.
8. **Analyze and fix:** evaluate test failures and permit bounded repair attempts under the same objective and checkpoint.
9. **Verify:** run local verification; push the candidate SHA to GitHub and the GitLab mirror; wait for SHA-bound GitHub and GitLab evidence.
10. **Integrate or wait:** automatically integrate only an eligible low-risk candidate after every gate passes. Otherwise leave a reviewable pull request and a bounded owner decision.
11. **Rest:** release leases, emit a content-free terminal receipt, clear transient reasoning, and perform no work until the next eligible window.

One cycle implements at most one bounded objective. It does not loop continuously or recursively trigger another cycle.

## Cloud objective envelope

The scheduled workflow supplies no natural-language prompt. It derives a strict envelope:

```js
{
  schemaVersion: 1,
  cycleId,
  projectId: "mahoraga",
  source: "github-schedule",
  windowStartedAt,
  baseSha,
  workflowId: "sovereign-eight-hour-cycle",
  maximumDurationMs: 7_200_000,
  maximumActions: 12,
  maximumRepairAttempts: 2,
  normalCreditBudget: 0,
  hostedComputeSpendCeilingUsd: 0
}
```

The project registry, not the envelope, owns roots, allowed paths, command definitions, data classes, concurrency, research sources, and automatic-integration risk classes.

Unknown fields, mismatched base SHAs, nonzero credit budgets, widened action counts, stale windows, and unregistered projects fail before local reasoning.

## Model and research routing

### Credit-free provider selector

`selectZeroCreditProvider()` evaluates providers in this exact order:

1. `codespaces-open-weight`, when cloud mode is enabled and quota, lifecycle, container, model, and transient-result canaries are fresh;
2. `local-open-weight`, when its loopback transient-result canary is fresh;
3. `deterministic-only`, when the objective needs no generative model;
4. `waiting-zero-credit-provider`.

The selector has no paid-provider branch. A provider record with a nonzero price, metered-model classification, unverifiable quota, unknown billing state, or missing zero-dollar stop guarantee is ineligible. Cloud results remain untrusted until schema validation, evidence checks, the execution firewall, project policy, and dual-platform verification pass.


### Local reasoner

The local fallback provider is the loopback transient reasoner defined by the sovereign-reasoning design. Its capability-specific canary must pass immediately before use. Prompt and response content is never written to workflow logs, GitHub, GitLab, the operational database, or Git history.

If the local fallback reasoner is unavailable after the cloud provider is ineligible:

- deterministic scans, audits, and registered verification continue;
- objectives requiring synthesis enter `waiting-zero-credit-provider`;
- no metered model is selected;
- the cycle ends with a zero-credit waiting receipt.

### Research

Research is retrieval, not authority. The research worker accepts a registry-owned source identifier and bounded query terms derived by policy. It permits HTTPS only to allowlisted primary domains, applies response size and time limits, records source URL hashes and retrieval timestamps, and passes transient content to the local reasoner.

A retrieved claim becomes a fact only after evidence validation. Research cannot create actions, expand paths, change the data plane, introduce credentials, or authorize integration.

## Candidate and mirror flow

1. The runner checks out the exact GitHub `main` SHA in an isolated worktree.
2. A candidate branch named `mahoraga/cycle/<cycleId>` is created from that SHA.
3. The action kernel applies and locally verifies the bounded change.
4. The runner pushes the candidate to GitHub and opens or updates one idempotent pull request.
5. The runner pushes the identical commit object to the GitLab mirror under the same branch name.
6. GitHub verification and GitLab verification independently evaluate that SHA from clean checkouts.
7. Mahoraga accepts a verification result only when repository identity, branch, commit SHA, workflow version, command IDs, and successful conclusions match the objective.
8. Divergent SHAs, missing evidence, stale checks, or a failed platform cause waiting or rollback; they never cause optimistic integration.

The GitLab connector available to this Codex session is an administrative convenience for setup and review. Mahoraga runtime does not depend on ChatGPT plugins. It uses ordinary Git and the GitLab API through a locally protected, project-scoped credential.

## Verification and integration policy

### Required gates

Every mutating candidate requires:

- exact base SHA and allowed-path validation;
- clean local focused tests;
- clean local full verification;
- successful GitHub candidate checks;
- successful GitLab candidate checks against the identical SHA;
- repository audit with zero blocking failures;
- content-boundary scan;
- zero-credit receipt;
- rollback checkpoint and successful rollback drill for core changes;
- fresh integration lease at the final action.

### Automatic integration

Automatic integration is allowed only for risk classes registered as `verified-auto-local`, after all required gates settle. Integration is performed through the pull request, never by pushing directly to `main`.

Changes to authority policy, workflow permissions, runner registration, credentials, repository visibility, branch protection, billing, external publication, public listeners, data-plane rules, destructive behavior, or `king-admin` remain owner-reserved.

Initial deployment runs in `candidate-only` mode. Automatic integration is enabled only after three consecutive real cycles complete with zero model credits, correct idempotency, matching dual-platform evidence, successful failure rollback, and no content leakage.

### Activation

A GitHub merge does not directly install code on the device. Existing `mahoraga-verified-automatic` activation creates a local rollback checkpoint, verifies the merged release artifact, activates it, health-checks it, and restores the prior release on failure.

## Cost containment

Normal operation has two independent ceilings:

- `normalCreditBudget: 0` prohibits metered model calls;
- `hostedComputeSpendCeilingUsd: 0` prohibits paid overage.

For Codespaces, the registered soft limit is lower than the account's included quota and reserves capacity for recovery. A cycle refuses to start when usage telemetry is stale, storage allowance is insufficient for the pinned model and worktree, or projected core-hours cross the soft limit. It never relies on an absent payment method as its only cost control.

The Codespace maximum active duration is 110 minutes per cycle, with a 100-minute work deadline and a 10-minute cleanup reserve. At three cycles per day this profile can exceed personal included usage; Mahoraga therefore selects cloud execution only while the monthly allowance projection remains within the registered reserve and uses the local runner for remaining cycles.

No cycle installs software through `curl | sh`, pulls an unpinned latest model, or downloads a model on every run. Dev-container dependencies and model artifacts are versioned by immutable digest and verified before execution.


Self-hosted GitHub and GitLab jobs are preferred for the autonomous work lane. Hosted runners may perform bounded independent verification only while included quota remains and the platform account cannot spend beyond the configured zero-dollar ceiling. If quota is exhausted or current usage cannot be verified, the corresponding hosted check waits or moves to an approved self-hosted verifier; it never incurs overage.

Artifacts and caches have explicit size and retention limits. A cycle cannot download a model into a hosted runner. The local model is installed and verified on the self-hosted Mahoraga machine.

## Durable state and learning

Mahoraga learns through verified procedural outcomes, not raw thought retention.

Permitted durable state includes:

- cycle, objective, project, branch, pull request, pipeline, and commit identifiers;
- source URL hashes and evidence references;
- action, test, failure, repair, rollback, and integration reason codes;
- counts, durations, timestamps, confidence bands, and policy versions;
- validated reusable method identifiers and their success/failure statistics;
- explicitly approved public-safe summaries.

Prohibited durable state includes prompts, private reasoning, candidate prose, model responses, retrieved page content, credentials, session tokens, patches copied into receipts, personal files, enterprise document content, and browser history.

A method becomes preferred only after repeated verified success. Failure reduces its score. No learned preference may widen authority, paths, commands, data planes, budgets, or automatic-integration risk classes.

## Failure behavior

- **Runner offline:** the GitHub job remains queued or ends without a cycle receipt; the next delivery resumes idempotently.
- **Duplicate schedule:** reuse the existing cycle and do not spend another attempt.
- **Local reasoner unavailable:** continue deterministic work and wait on model-dependent work.
- **Research source unavailable:** retain uncertainty and continue only if the objective remains evidence-sufficient.
- **Candidate verification failure:** restore the worktree checkpoint, retain bounded failure evidence, and stop.
- **GitHub/GitLab mismatch:** prohibit integration and report `dual-ledger-sha-mismatch`.
- **Hosted quota unavailable:** prohibit paid use and report `hosted-compute-quota-unavailable`.
- **Credential/authentication failure:** stop before push; never print or copy the credential.
- **Audit, policy, checkpoint, or rollback unhealthy:** prohibit automatic integration and `king-admin` activation.
- **Reserved action discovered:** leave the candidate reviewable and request the exact owner decision.
- **Post-activation health failure:** automatically restore the prior local release.

## Implementation decomposition

This architecture is implemented after the existing sovereign contracts are available:

1. **Cloud envelope and cadence:** strict cycle contract, idempotent ledger, GitHub schedule, provider selection, and candidate-only mode.
2. **Cloud executor:** Codespaces lifecycle client, quota and zero-dollar budget guard, pinned dev container, pinned local model, bounded Chromium research, transient cleanup, and local fallback.
3. **Local cycle worker:** scan, synthesize, research, plan, and typed project actions through a verified open-weight provider.
4. **GitLab mirror and assurance:** controlled bootstrap, same-SHA push, read-only CI, bounded receipts, and mismatch handling.
5. **Dual-verification promotion:** GitHub/GitLab evidence reconciliation, low-risk automatic pull-request integration, and verified activation.
6. **Learning and operations:** procedural method scoring, quota telemetry, Control Center cycle view, offline recovery, and adversarial drills.

GitLab mirroring, Codespaces lifecycle control, and scheduled autonomous mutation remain disabled until their respective acceptance gates pass.

## Acceptance criteria

- No normal cycle invokes ChatGPT, Codex, Copilot, OpenAI API, GitLab Duo, browser-session automation, or another metered model.
- Credit-free provider selection is fixed to Codespaces open-weight, local open-weight, deterministic-only, then waiting.
- Normal receipts prove zero metered provider calls, zero model credits, and zero paid compute.
- Codespaces never starts when billing, quota, projected core-hours, artifact storage, provider canary, or zero-dollar stop evidence is unavailable.
- The Codespace stops after every terminal outcome and is never treated as durable memory.
- Cloud Chromium cannot authenticate to websites, reuse browser sessions, submit forms, or perform external side effects.
- A deleted or quota-exhausted Codespace falls back locally without a model credit.
- Colab is never used as an unattended Mahoraga worker.
- Model and container artifacts are immutable and checksum-verified.
- A real open-weight-model-assisted candidate is created through typed project actions.
- A deterministic cycle succeeds when both generative providers are unavailable.
- Model-dependent work waits without paid fallback.
- GitHub and GitLab verify the identical candidate SHA from clean checkouts.
- GitLab cannot modify authoritative GitHub `main`.
- Duplicate and delayed schedules do not create duplicate objectives or attempts.
- Failed verification restores the candidate worktree byte-for-byte.
- Raw prompts, reasoning, responses, research content, and credentials are absent from Git, logs, databases, artifacts, issues, pull requests, and receipts.
- Automatic integration remains candidate-only until three consecutive real-cycle gates pass.
- Eligible low-risk candidates integrate only through verified pull requests.
- Reserved and high-risk changes require the owner.
- Production activation retains checkpoint, health check, and automatic rollback.
- No runner or runtime exposes an inbound network surface.

## Non-goals

- Continuous unbounded execution.
- Self-retraining model weights.
- Browser automation of subscription products or authenticated websites.
- Generic shell access or model-selected commands.
- Public repository conversion.
- Dual-authoritative GitHub/GitLab writes.
- Persisting chain-of-thought or raw research corpora.
- Automatic permission, credential, billing, visibility, or branch-protection changes.
- Treating subsidized cloud capacity as guaranteed or unlimited.

## Platform references

- GitHub Actions billing and self-hosted runner behavior: https://docs.github.com/en/billing/concepts/product-billing/github-actions
- GitHub self-hosted runner requirements: https://docs.github.com/en/actions/reference/runners/self-hosted-runners
- GitHub scheduled workflow semantics: https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#onschedule
- GitHub scheduled-event delay behavior: https://docs.github.com/en/actions/how-tos/troubleshoot-workflows#scheduled-workflows-running-at-unexpected-times
- GitHub Codespaces included usage: https://docs.github.com/en/billing/reference/product-usage-included
- GitHub Codespaces lifecycle and idle deletion: https://docs.github.com/en/codespaces/about-codespaces/understanding-the-codespace-lifecycle
- GitHub Codespaces lifecycle API: https://docs.github.com/en/rest/codespaces/codespaces
- GitLab compute-minute quotas: https://docs.gitlab.com/ci/pipelines/compute_minutes/
- GitLab runner categories: https://docs.gitlab.com/ci/runners/
- GitLab scheduled pipeline semantics: https://docs.gitlab.com/ci/pipelines/schedules/
- Google Colab free-runtime restrictions: https://research.google.com/colaboratory/faq.html
