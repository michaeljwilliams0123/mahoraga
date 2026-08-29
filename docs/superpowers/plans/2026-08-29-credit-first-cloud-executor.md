# Credit-First Cloud Executor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an optional GitHub Codespaces open-weight execution lane that consumes zero model credits and zero paid compute, falls back to Mahoraga's local open-weight provider, and otherwise waits.

**Architecture:** A strict provider selector admits a Codespace only after lifecycle, quota, zero-dollar budget, immutable container/model, and transient-result canaries pass. The Codespace exposes typed Mahoraga actions and bounded unauthenticated Chromium research, pushes a candidate branch, and stops after every outcome. Existing sovereign contracts, project actions, GitHub authority, and GitLab same-SHA assurance remain canonical.

**Tech Stack:** Node.js 24 ESM, `node:test`, GitHub Codespaces REST API, dev containers, pinned `llama.cpp` runtime, Chromium/Playwright adapter boundary, GitHub Actions, GitLab CI.

**Spec:** `docs/superpowers/specs/2026-08-29-mahoraga-zero-credit-cloud-orchestration-design.md`

## Global Constraints

- Credit-free order is `codespaces-open-weight`, `local-open-weight`, `deterministic-only`, then `waiting-zero-credit-provider`.
- `normalCreditBudget` and `hostedComputeSpendCeilingUsd` are exactly `0`.
- No paid-provider branch, arbitrary shell, caller-selected executable, authenticated browser session, direct push to `main`, or raw reasoning persistence exists.
- Codespaces maximum active duration is 110 minutes: 100 minutes work plus 10 minutes cleanup.
- Container, runtime, and model artifacts are selected by registry identifier and immutable digest.
- Colab is not an unattended execution provider.
- Implementation starts in `candidate-only` mode.

---

### Task 1: Zero-Credit Provider and Codespaces Contracts

**Files:**
- Create: `src/zero-credit-provider-selector.mjs`
- Create: `src/codespaces-contract.mjs`
- Create: `test/zero-credit-provider-selector.test.mjs`
- Create: `test/codespaces-contract.test.mjs`
- Modify: `mahoraga.manifest.json`

**Interfaces:**
- Produces: `selectZeroCreditProvider({ objective, providers, now }): ProviderDecision`.
- Produces: `validateCodespacesProfile(value): CodespacesProfile`.
- Consumes registry profile fields `id`, `repository`, `codespaceName`, `machineClass`, `devcontainerDigest`, `modelArtifactId`, `maximumActiveMs`, `workDeadlineMs`, `monthlyCoreHourSoftLimit`, and `hostedComputeSpendCeilingUsd`.

- [ ] **Step 1: Write failing provider-order tests**

```js
test("credit-free selection has no metered fallback", () => {
  assert.deepEqual(selectZeroCreditProvider({
    objective: { generative: true, normalCreditBudget: 0 },
    providers: {
      codespaces: readyProvider("codespaces-open-weight"),
      local: readyProvider("local-open-weight"),
      metered: readyProvider("codex"),
    },
    now,
  }), { providerId: "codespaces-open-weight", reason: "cloud-zero-credit-ready" });

  assert.deepEqual(selectZeroCreditProvider({
    objective: { generative: true, normalCreditBudget: 0 },
    providers: { codespaces: unavailable(), local: unavailable(), metered: readyProvider("codex") },
    now,
  }), { providerId: null, reason: "waiting-zero-credit-provider" });
});
```

- [ ] **Step 2: Run `node --test test/zero-credit-provider-selector.test.mjs test/codespaces-contract.test.mjs` and confirm `ERR_MODULE_NOT_FOUND`.**
- [ ] **Step 3: Implement strict frozen contracts.** Reject unknown fields, nonzero budgets, active duration above `6_600_000`, work deadline above `6_000_000`, mutable model tags, non-GitHub repositories, non-loopback inference endpoints, and a provider classified as metered.
- [ ] **Step 4: Insert `selectZeroCreditProvider()` before reliability/cost ranking in `src/router.mjs`; preserve deterministic routing when both generative providers are unavailable.**
- [ ] **Step 5: Run the focused tests plus `node --test test/router.test.mjs test/config.test.mjs`; require zero failures.**
- [ ] **Step 6: Commit with `git commit -m "feat: enforce credit-first provider selection"`.**

### Task 2: Codespaces Lifecycle, Quota, and Zero-Dollar Guard

**Files:**
- Create: `src/codespaces-client.mjs`
- Create: `src/cloud-compute-budget.mjs`
- Create: `test/codespaces-client.test.mjs`
- Create: `test/cloud-compute-budget.test.mjs`
- Modify: `src/provider-readiness.mjs`

**Interfaces:**
- Produces: `createCodespacesClient(profile, { fetch, credentialProvider, clock })`.
- Produces: client methods `inspect()`, `start()`, `executeRegisteredWorkflow(workflowId)`, and `stop()`.
- Produces: `evaluateCloudComputeBudget({ usage, projection, profile, observedAt, now }): BudgetDecision`.

- [ ] **Step 1: Write an HTTP fixture test proving only the registered Codespace lifecycle endpoints are called and authorization is redacted from errors and receipts.**
- [ ] **Step 2: Write budget tests that reject stale telemetry, unknown billing state, missing stop-usage evidence, projected core-hours above the soft limit, insufficient storage, and any positive spend ceiling.**
- [ ] **Step 3: Run `node --test test/codespaces-client.test.mjs test/cloud-compute-budget.test.mjs`; confirm missing-module failures.**
- [ ] **Step 4: Implement the client with fixed `api.github.com` origin, redirect refusal, response-size limit, abort deadline, credential callback, and content-free error codes.**
- [ ] **Step 5: Implement the budget guard.** Return `cloud-zero-credit-ready` only when telemetry is fresh, `stopUsageAtBudgetLimit === true`, `spendCeilingUsd === 0`, and projected use stays below the registered reserve.
- [ ] **Step 6: Add a capability-specific readiness probe that verifies lifecycle access without starting the Codespace and persists no codespace URL, token, or model identifier.**
- [ ] **Step 7: Run focused tests plus `node --test test/provider-readiness.test.mjs`; commit with `git commit -m "feat: guard zero-dollar cloud lifecycle"`.**

### Task 3: Immutable Cloud Sandbox and Bounded Research

**Files:**
- Create: `.devcontainer/mahoraga-cloud/devcontainer.json`
- Create: `scripts/bootstrap-cloud-reasoner.mjs`
- Create: `src/cloud-browser-research.mjs`
- Create: `test/cloud-sandbox-contract.test.mjs`
- Create: `test/cloud-browser-research.test.mjs`
- Modify: `src/local-reasoner-provider.mjs`

**Interfaces:**
- Produces: `validateCloudSandbox(root, registryProfile): SandboxEvidence`.
- Produces: `researchPrimarySource({ sourceId, query, deadlineAt }, dependencies): ResearchEvidence`.
- Consumes only registry-owned artifact URLs and SHA-256 digests.

- [ ] **Step 1: Write source tests rejecting floating dev-container images/features, `curl | sh`, unpinned model pulls, arbitrary package installation, public ports, and missing artifact digests.**
- [ ] **Step 2: Write browser tests rejecting non-allowlisted origins, authentication, cookies, form submission, downloads, redirects across origins, responses above the byte limit, and persistence of page content.**
- [ ] **Step 3: Run both tests and confirm the new modules/configuration are absent.**
- [ ] **Step 4: Add the minimal dev container with no exposed public ports and a bootstrap command that verifies registered SHA-256 artifacts before placing them in the provider cache.**
- [ ] **Step 5: Implement research as bounded GET-only retrieval with disabled credential store, fresh browser context per request, primary-domain allowlist, timeout, byte limit, and content-free receipt.**
- [ ] **Step 6: Adapt the transient reasoner contract so the same validated provider result can arrive from the Codespace loopback process without tool, worker, or authority fields.**
- [ ] **Step 7: Run focused tests plus `node --test test/local-reasoner-provider.test.mjs test/browser-cdp.test.mjs`; commit with `git commit -m "feat: add immutable cloud reasoning sandbox"`.**

### Task 4: Eight-Hour Candidate Cycle and Guaranteed Cleanup

**Files:**
- Create: `src/cloud-cycle-worker.mjs`
- Create: `test/cloud-cycle-worker.test.mjs`
- Create: `.github/workflows/sovereign-eight-hour-cycle.yml`
- Modify: `src/database.mjs`
- Modify: `src/supervisor.mjs`

**Interfaces:**
- Produces: `runCloudCycle(envelope, dependencies): Promise<CycleReceipt>`.
- Consumes the existing project registry, action kernel, reasoning engine, checkpoint service, and GitHub candidate publisher.
- Emits bounded states `queued`, `cloud-running`, `local-running`, `verifying`, `waiting`, `failed`, and `candidate-ready`.

- [ ] **Step 1: Write tests for idempotent eight-hour windows, single fenced lease, Codespaces-first selection, local fallback, deterministic continuation, paid-provider refusal, and candidate-only completion.**
- [ ] **Step 2: Write failure-injection tests proving `client.stop()` runs after provider timeout, malformed output, patch failure, verification failure, push failure, cancellation, and process interruption recovery.**
- [ ] **Step 3: Run `node --test test/cloud-cycle-worker.test.mjs`; confirm missing-module failure.**
- [ ] **Step 4: Implement one-objective cycle orchestration with a 100-minute work deadline and cleanup in `finally`; persist only identifiers, hashes, counts, timestamps, and reason codes.**
- [ ] **Step 5: Add the GitHub schedule `17 */8 * * *`, owner-only manual dispatch, explicit minimal permissions, concurrency group, immutable action SHAs, and `candidate-only` mode.**
- [ ] **Step 6: Add tests to `test/github-audit.test.mjs` requiring the workflow's zero-credit command, no Codex/Copilot/OpenAI secrets, no public listener, and no direct-main push.**
- [ ] **Step 7: Run focused tests, `node scripts/github-audit.mjs`, and the full repository verify command; commit with `git commit -m "feat: schedule zero-credit candidate cycles"`.**

### Task 5: GitLab Same-SHA Assurance and Release Gate

**Files:**
- Create: `.gitlab-ci.yml`
- Create: `src/gitlab-assurance.mjs`
- Create: `test/gitlab-assurance.test.mjs`
- Create: `test/zero-credit-cloud-cycle.test.mjs`
- Modify: `src/runtime.mjs`
- Modify: `src/server.mjs`

**Interfaces:**
- Produces: `validateGitLabAssurance({ objective, github, gitlab }): AssuranceReceipt`.
- Produces authenticated `GET /api/sovereignty/cycles` with content-free cycle, provider, quota band, candidate, and assurance state.

- [ ] **Step 1: Write tests requiring GitHub and GitLab repository identities, candidate branches, commit SHAs, workflow versions, command IDs, and successful conclusions to match exactly.**
- [ ] **Step 2: Write an end-to-end temporary-project test that uses a deterministic fixture provider labeled `codespaces-open-weight`, applies a real patch, verifies it, emits zero-credit/zero-dollar receipts, and never modifies `main`.**
- [ ] **Step 3: Run the focused tests and confirm missing GitLab assurance and cycle wiring.**
- [ ] **Step 4: Add read-only GitLab CI using Node 24 and `npm run verify`; it may publish pipeline evidence but has no GitHub credential or repository write permission.**
- [ ] **Step 5: Implement same-SHA reconciliation and the redacted Control Center API. Mismatch returns `dual-ledger-sha-mismatch` and prohibits integration.**
- [ ] **Step 6: Run full verification, a quota-exhaustion drill, Codespace-deletion fallback drill, credential-redaction test, cleanup drill, GitLab mismatch drill, and inactive-runtime smoke.**
- [ ] **Step 7: Keep production and automatic integration disabled; commit with `git commit -m "feat: gate dual-ledger zero-credit cycles"`.**
