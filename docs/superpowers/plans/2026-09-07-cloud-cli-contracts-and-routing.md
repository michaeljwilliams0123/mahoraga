# Cloud CLI Contracts and Economic Routing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Add one strict, versioned contract for third-party CLI work and a routing policy that preserves a zero-incremental-cost baseline while allowing an already-licensed ChatGPT Business CLI adapter for high-value building only after a fresh capability probe.

**Architecture:** The authoritative GitHub repository owns task validation, policy, receipts, and route selection. Deterministic execution is selected first, then verified zero-cost local/open-weight execution. The optional licensed Business route is considered only for novel implementation or high-reasoning tasks and never substitutes metered API billing. A separate broker manifest section controls rollout without weakening the existing supervisor allowlist.

**Tech Stack:** Node.js 24 ESM, JSON Schema 2020-12, node:test, existing Mahoraga manifest/config and receipt registry.

**Spec:** [2026-09-07-cloud-cli-memory-broker-design.md](../specs/2026-09-07-cloud-cli-memory-broker-design.md)

**Global Constraints:**

- Incremental spend must remain exactly USD 0. A ChatGPT Business subscription is treated as a pre-existing license, not proof of CLI/API availability.
- Never select a paid API, overage, credit purchase, or metered fallback.
- Raw shell is not added to the Mahoraga supervisor. It exists only in the ephemeral GitLab job defined by the next plan.
- Task input cannot choose its provider, worker, merge authority, protected-path status, or policy version.
- Memory is evidence only; versioned GitHub policy remains authority.
- Do not add Codex review requests, PR review comments, reactions, or Vercel work.
- Every success receipt binds repository, exact base/head commits, changed paths, verification digest, runner identity, and policy digest.

## Task 1: Add the cloud CLI task envelope

**Files:**
- Create: \`contracts/cloud-cli-task.schema.json\`
- Create: \`src/cloud-cli-task-contract.mjs\`
- Test: \`test/cloud-cli-task-contract.test.mjs\`

- [ ] Write failing tests covering a valid envelope, unknown fields, stale/non-SHA base commits, path traversal, caller-selected providers, embedded credentials, duplicate paths, and oversized commands.

Use this minimum public constructor:

\`\`\`js
createCloudCliTask({
  idempotencyKey,
  source,
  repository,
  baseCommit,
  objective,
  completionCriteria,
  allowedPaths,
  execution,
  reasoningClass,
  maximumAttempts,
  createdAt,
})
\`\`\`

The normalized immutable record must contain exactly:

\`\`\`js
{
  schemaVersion: 1,
  taskId: "tsk_<32 lowercase hex>",
  idempotencyKey,
  source: "chatgpt-gitlab" | "github-cloudflare",
  repository: "michaeljwilliams0123/mahoraga",
  baseCommit: "<40 lowercase hex>",
  objective: "<1..2000 chars, no secrets>",
  completionCriteria: ["<1..240 chars>"],
  allowedPaths: ["relative/path"],
  execution: {
    mode: "ephemeral-shell",
    command: "<1..8192 chars, no NUL or credential material>",
    timeoutSeconds: 60..3600
  },
  reasoningClass: "deterministic" | "routine" | "high-reasoning" | "novel-implementation",
  maximumAttempts: 1..10,
  createdAt: "<canonical ISO timestamp>"
}
\`\`\`

Compute \`taskId\` from the canonical envelope without \`taskId\` using SHA-256. Reject \`.git\`, absolute paths, \`..\`, backslashes, control characters, secret-shaped text, and all unknown fields.

- [ ] Run \`node --test test/cloud-cli-task-contract.test.mjs\` and confirm the tests fail because the module does not exist.
- [ ] Implement the JSON schema and the matching dependency-free runtime validator. Export \`createCloudCliTask\`, \`validateCloudCliTask\`, \`cloudCliTaskDigest\`, and \`CloudCliTaskContractError\`.
- [ ] Run the focused test and confirm it passes.
- [ ] Commit with \`git commit -m "feat: add cloud cli task contract"\`.

## Task 2: Add broker policy to the versioned manifest

**Files:**
- Modify: \`mahoraga.manifest.json\`
- Create: \`src/cloud-cli-broker-policy.mjs\`
- Modify: \`src/config.mjs\`
- Test: \`test/cloud-cli-broker-policy.test.mjs\`
- Modify: \`test/config.test.mjs\`

- [ ] Write failing tests that require this exact policy shape:

\`\`\`json
{
  "cloudCliBroker": {
    "enabled": false,
    "killSwitch": true,
    "incrementalSpendLimitUsd": 0,
    "branchPrefix": "feature/cloud-cli-",
    "verificationWorkflow": "Verify Mahoraga",
    "physicalConcurrency": 2,
    "objectiveLoop": {
      "initialLogicalLanes": 2,
      "maximumLogicalLanes": 16,
      "initialCycleLimit": 12,
      "maximumCycleLimit": 100
    },
    "licensedBusiness": {
      "enabled": false,
      "highValueOnly": true,
      "freshProbeSeconds": 900,
      "meteredFallback": false
    }
  }
}
\`\`\`

Tests must reject an enabled broker while \`killSwitch\` is true, any positive spend limit, physical concurrency above 2, logical lanes above 16, cycles above 100, licensed Business without \`highValueOnly\`, and any metered fallback.

- [ ] Run \`node --test test/cloud-cli-broker-policy.test.mjs test/config.test.mjs\` and observe the expected failures.
- [ ] Implement \`validateCloudCliBrokerPolicy(value)\` and \`cloudCliBrokerPolicySnapshot(manifest)\`. Call the validator in \`src/config.mjs\` before delegating to the legacy manifest validator, and preserve the validated section in the returned frozen manifest.
- [ ] Add the disabled, kill-switched policy to both the live manifest and any checked-in manifest fixture/backup required by \`test/config.test.mjs\`.
- [ ] Run the focused tests and \`npm run verify\`.
- [ ] Commit with \`git commit -m "feat: add cloud cli broker policy"\`.

## Task 3: Extend economic routing without contaminating zero-credit selection

**Files:**
- Keep unchanged: \`src/zero-credit-provider-selector.mjs\`
- Create: \`src/cloud-cli-route-selector.mjs\`
- Test: \`test/cloud-cli-route-selector.test.mjs\`
- Modify: \`test/zero-credit-provider-selector.test.mjs\`

- [ ] Add regression tests proving \`selectZeroCreditProvider\` retains its current order: Codespaces open-weight, local open-weight, deterministic-only, then waiting.
- [ ] Write failing route-selector tests for these decisions:

| Task | Available evidence | Expected route |
|---|---|---|
| deterministic | none | \`deterministic-only\` |
| routine generation | fresh zero-cost local | \`local-open-weight\` |
| high-reasoning | fresh zero-cost local + Business | \`local-open-weight\` |
| novel implementation | local unavailable + fresh licensed Business | \`licensed-business-cli\` |
| high-value | Business probe stale | \`waiting-zero-incremental-cost\` |
| any | adapter reports metered/overage | reject adapter and wait |

- [ ] Run \`node --test test/cloud-cli-route-selector.test.mjs test/zero-credit-provider-selector.test.mjs\` and confirm the new tests fail.
- [ ] Implement:

\`\`\`js
selectCloudCliRoute({
  task,
  providers,
  brokerPolicy,
  now,
})
\`\`\`

First call \`selectZeroCreditProvider\`. Return its selected route whenever possible. Consider \`licensed-business-cli\` only when:
1. \`reasoningClass\` is \`high-reasoning\` or \`novel-implementation\`;
2. the zero-credit selector would otherwise wait;
3. broker and licensed route are enabled and kill switch is false;
4. the probe is authenticated, successful, no older than \`freshProbeSeconds\`;
5. \`incrementalPriceUsd === 0\`, \`overageEnabled === false\`, and \`meteredApi === false\`.

Return \`{status:"waiting", providerId:"waiting-zero-incremental-cost", costClass:null}\` instead of selecting anything billable.

- [ ] Run focused tests and \`npm run verify\`.
- [ ] Commit with \`git commit -m "feat: route cloud cli work by economic value"\`.

## Task 4: Define capability probes and digest-bound execution receipts

**Files:**
- Create: \`src/cloud-cli-adapter-contract.mjs\`
- Modify: \`src/receipt-registry.mjs\`
- Test: \`test/cloud-cli-adapter-contract.test.mjs\`
- Modify: \`test/receipt-registry.test.mjs\`

- [ ] Write failing tests for adapter probes with exact fields \`adapterId\`, \`authenticated\`, \`ready\`, \`incrementalPriceUsd\`, \`meteredApi\`, \`overageEnabled\`, \`observedAt\`, and \`capabilityDigest\`.
- [ ] Write failing receipt tests for capability \`cloud-cli.execute\`. Reject raw stdout/stderr, prompts, transcripts, environment values, private keys, and bearer tokens.
- [ ] Implement \`validateCloudCliAdapterProbe\` and extend \`FAMILY_PREFIXES\` with \`["cloud-cli", "cloud-cli"]\`.
- [ ] Validate this provider evidence shape:

\`\`\`js
{
  taskId,
  source,
  routeId,
  runnerId,
  repository,
  baseCommit,
  headCommit,
  branch,
  changedPaths,
  verificationDigest,
  policyDigest,
  artifactDigest,
  memoryObservationIds,
  shellProfile: "bash-noprofile-norc-errexit",
  ephemeral: true,
  incrementalSpendUsd: 0,
  finalResponseStored: false
}
\`\`\`

Require exact SHA/path formats, \`ephemeral === true\`, \`incrementalSpendUsd === 0\`, and \`finalResponseStored === false\`.

- [ ] Run the focused tests and \`npm run verify\`.
- [ ] Commit with \`git commit -m "feat: add cloud cli adapter and receipt contracts"\`.

## Task 5: Document the Business lane as optional licensed acceleration

**Files:**
- Create: \`docs/cloud-cli/economic-routing.md\`
- Modify: \`README.md\`
- Test: \`test/cloud-cli-economic-routing-docs.test.mjs\`

- [ ] Write a failing documentation test that checks for the phrases \`zero incremental spend\`, \`fresh authenticated capability probe\`, \`no metered API fallback\`, and \`subscription is not API authorization\`.
- [ ] Document that the planned ChatGPT Business upgrade may accelerate high-value building only if an actual third-party CLI adapter can authenticate under the license. Explicitly state that the system waits when this cannot be proven.
- [ ] Document provider ordering, kill-switch behavior, and the distinction between subscription cost and per-run incremental spend.
- [ ] Run \`node --test test/cloud-cli-economic-routing-docs.test.mjs\` and \`npm run verify\`.
- [ ] Commit with \`git commit -m "docs: define cloud cli economic routing"\`.

## Completion Gate

- [ ] \`npm run verify\` passes from a clean checkout.
- [ ] No secret or conversation content appears in fixtures or receipts.
- [ ] Existing zero-credit selector behavior is unchanged.
- [ ] Broker policy is committed disabled with the kill switch on.
- [ ] Licensed Business is impossible to select without a fresh authenticated, non-metered, zero-incremental-cost probe.
