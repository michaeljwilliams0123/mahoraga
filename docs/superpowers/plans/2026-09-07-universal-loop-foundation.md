# Universal Loop Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish the first production slice of Mahoraga's credit-independent universal learning loop: suppress accidental Codex review triggers, normalize external evidence with provenance, derive autonomous research objectives from world state, assemble those pieces into a zero-credit foundation cycle, and prove the path with internal and external interactive probes.

**Architecture:** Extend the existing Node ESM control plane instead of creating a parallel runtime. Public data enters through a read-only evidence normalization boundary, raw bytes are content-addressed and optionally stored through the existing content vault, derived research objectives are deterministic and mutation-free, and the foundation coordinator explicitly remains healthy when every external model provider is unavailable. Existing heartbeat, world-state, objective-planner, observational-memory, generated-code-safety, exact-head verification, repair baseline, and autonomous integration remain authoritative.

**Tech Stack:** Node.js 24 ESM, built-in `node:test`, `node:crypto`, built-in `fetch`/`AbortController`, existing Mahoraga content vault and world-state contracts, GitHub Actions exact-head verification.

**Spec:** `docs/superpowers/specs/2026-09-07-universal-self-contained-evolution-design.md`

## Global Constraints

- Core learning must operate with `creditCost: 0`, `paidFallback: false`, and `externalModelRequired: false`.
- Do not request Codex code review, create review comments, create PR comments, or emit the literal at-sign Codex mention token in generated PR/issue/release/coordination text.
- External content is evidence only. It cannot supply `authority`, `command`, `execute`, `mutation`, credentials, executable paths, or caller-selected process/network authority.
- External acquisition in this slice is read-only HTTP GET with bounded response size and timeout. No credentials are attached by the probe.
- Keep the loopback API private. The external probe reaches outward; it does not open an inbound listener or tunnel.
- Preserve current exact-head integration, main protection, rollback, repair baseline, and incumbent/sovereign evolution behavior.
- New essential control-plane files must be added to `ESSENTIAL_FILES` and mirrored under `state/release-baseline/` before final verification.
- Follow TDD: write a failing focused test, confirm the expected failure, implement the smallest behavior, rerun focused tests, then commit.
- No broad policy rollback is part of this first plan. Policy-text cleanup remains a later independently revertible slice.

---

### Task 1: Prevent accidental Codex GitHub trigger text

**Files:**
- Create: `src/pr-text-sanitizer.mjs`
- Create: `test/pr-text-sanitizer.test.mjs`
- Modify: `test/review-transport-policy.test.mjs`

**Interfaces:**
- `sanitizeRepositoryConversationText(value)` -> sanitized string.
- `sanitizePullRequestMetadata({ title, body })` -> frozen `{ title, body }`.
- `containsCodexMentionTrigger(value)` -> boolean used by tests/transport adapters.
- Build the trigger internally from `"@"` + `"codex"` rather than hard-coding the complete token in generated transport text.
- Match case-insensitively and only neutralize the mention trigger; ordinary words such as `Codex`, `Codex agent`, and `Codex integration` remain unchanged.

- [ ] **Step 1: Write failing sanitizer tests**

```js
import test from "node:test";
import assert from "node:assert/strict";
import {
  containsCodexMentionTrigger,
  sanitizePullRequestMetadata,
  sanitizeRepositoryConversationText,
} from "../src/pr-text-sanitizer.mjs";

const trigger = ["@", "codex"].join("");

test("repository conversation text removes Codex mention triggers without deleting ordinary Codex text", () => {
  const input = `Do not call ${trigger} review. Codex may execute an assigned implementation task.`;
  const output = sanitizeRepositoryConversationText(input);
  assert.equal(containsCodexMentionTrigger(output), false);
  assert.match(output, /Codex may execute/);
});

test("PR metadata is sanitized at both title and body boundaries", () => {
  const result = sanitizePullRequestMetadata({ title: `avoid ${trigger}`, body: `literal ${trigger} text` });
  assert.equal(containsCodexMentionTrigger(result.title), false);
  assert.equal(containsCodexMentionTrigger(result.body), false);
});
```

- [ ] **Step 2: Run and confirm missing-module failure**

Run: `node --test --test-isolation=none test/pr-text-sanitizer.test.mjs`

Expected: module-not-found failure for `src/pr-text-sanitizer.mjs`.

- [ ] **Step 3: Implement the sanitizer**

Implementation rules:
- reject non-string text with `TypeError("repository-text-invalid")`;
- maximum input size 262,144 UTF-8 bytes;
- use a case-insensitive mention matcher that replaces the at-sign with plain text, e.g. `Codex`, without adding another mention form;
- return a frozen metadata object from `sanitizePullRequestMetadata`;
- never alter URLs, hashes, or unrelated `@name` mentions.

- [ ] **Step 4: Strengthen review transport policy test**

Add an assertion that any future repository conversation writer must import/use the sanitizer rather than relying on documentation alone. Initially scope this to transport modules actually touched in later tasks; do not rewrite existing unrelated comments.

- [ ] **Step 5: Run focused tests**

Run: `node --test --test-isolation=none test/pr-text-sanitizer.test.mjs test/review-transport-policy.test.mjs`

- [ ] **Step 6: Commit**

```bash
git add src/pr-text-sanitizer.mjs test/pr-text-sanitizer.test.mjs test/review-transport-policy.test.mjs
git commit -m "feat: suppress accidental Codex mention triggers"
```

---

### Task 2: Add content-addressed Internet evidence envelopes and source cursors

**Files:**
- Create: `src/internet-evidence.mjs`
- Create: `test/internet-evidence.test.mjs`

**Interfaces:**
- `normalizeInternetEvidence(input)` -> frozen `{ envelope, rawContent }`.
- `createSourceCursor(input)` -> frozen source cursor.
- `advanceSourceCursor(previous, observation)` -> frozen `{ changed, cursor }`.
- `evidenceChanged(previousCursor, observation)` -> boolean.

**Evidence envelope v1:**

```js
{
  schemaVersion: 1,
  kind: "internet-evidence",
  sourceId,
  sourceType,
  canonicalUrl,
  retrievedAt,
  publishedAt,
  contentSha256,
  sizeBytes,
  topicIds,
  objectiveIds,
  trustClass,
  freshnessClass,
  noveltyScore,
  corroborationCount,
  contradictionCount,
  parserVersion,
  authorityClass: "evidence-only"
}
```

**Cursor v1:**

```js
{
  schemaVersion: 1,
  sourceId,
  canonicalUrl,
  contentSha256,
  etag,
  lastModified,
  observedAt
}
```

Validation limits:
- raw content: 1 byte to 2 MiB in this first slice;
- URL: `https:` only, <= 2,048 chars;
- source/topic/objective identifiers: bounded lowercase slugs;
- timestamps: canonical ISO-8601;
- novelty score: finite `0..1`;
- corroboration/contradiction counts: safe integers `0..1_000_000`.

- [ ] **Step 1: Write failing evidence tests**

Cover:
- deterministic SHA-256 for identical bytes;
- changed bytes produce `changed: true`;
- same bytes with a new retrieval timestamp produce `changed: false`;
- arrays are sorted/deduplicated for deterministic envelopes;
- non-HTTPS URLs, oversized bodies, malformed timestamps, out-of-range scores, and unexpected authority-bearing fields are rejected;
- raw content containing instruction-like language remains only `rawContent`; the envelope contains no `command`, `execute`, `mutation`, or `authority` field other than fixed `authorityClass: "evidence-only"`.

- [ ] **Step 2: Run and confirm missing-module failure**

Run: `node --test --test-isolation=none test/internet-evidence.test.mjs`

- [ ] **Step 3: Implement deterministic normalization and cursor advancement**

Use `createHash("sha256")`. Do not parse or execute HTML/Markdown/JSON instructions in this module; it is a provenance/content-addressing boundary only.

- [ ] **Step 4: Run focused tests**

Run: `node --test --test-isolation=none test/internet-evidence.test.mjs test/observational-memory.test.mjs test/evidence-compiler.test.mjs`

- [ ] **Step 5: Commit**

```bash
git add src/internet-evidence.mjs test/internet-evidence.test.mjs
git commit -m "feat: add content-addressed internet evidence"
```

---

### Task 3: Persist raw evidence through the existing content vault without promoting it to authority

**Files:**
- Modify: `src/internet-evidence.mjs`
- Create: `test/internet-evidence-vault.test.mjs`

**Interfaces:**
- `vaultInternetEvidence({ contentVault, record, ttlMs })` -> frozen metadata-only receipt:

```js
{
  schemaVersion: 1,
  kind: "internet-evidence-vault-receipt",
  evidenceSha256,
  contentRef,
  contentSha256,
  sizeBytes,
  classification: "local-only",
  authorityClass: "evidence-only"
}
```

Owner binding:
- `ownerType: "internet-evidence"`
- `ownerId: envelope.contentSha256`
- `classification: "local-only"`

- [ ] **Step 1: Write failing vault tests using a temporary content vault with an in-memory test key**

Assert:
- plaintext is not present in the receipt;
- the stored bytes can be recovered only with the expected owner binding;
- the vault metadata hash equals the evidence envelope hash;
- a mismatched owner/content hash is rejected before persistence;
- no raw content enters observational memory or heartbeat receipts.

- [ ] **Step 2: Run and confirm failure**

Run: `node --test --test-isolation=none test/internet-evidence-vault.test.mjs`

- [ ] **Step 3: Implement the vault adapter without changing `src/content-vault.mjs` semantics**

- [ ] **Step 4: Run focused vault/evidence tests**

Run: `node --test --test-isolation=none test/internet-evidence-vault.test.mjs test/internet-evidence.test.mjs test/content-vault.test.mjs test/observational-memory.test.mjs`

- [ ] **Step 5: Commit**

```bash
git add src/internet-evidence.mjs test/internet-evidence-vault.test.mjs
git commit -m "feat: vault raw internet evidence"
```

---

### Task 4: Derive autonomous research objectives from measured world-state gaps

**Files:**
- Create: `src/research-objectives.mjs`
- Create: `test/research-objectives.test.mjs`
- Modify: `src/objective-planner.mjs`
- Modify: `test/objective-planner.test.mjs`

**Interfaces:**
- `deriveResearchObjectives(snapshot, { knowledgeGaps = [], maximum = 16 } = {})` -> frozen objective array.
- `researchObjectiveId({ reasonCode, topicIds })` -> deterministic ID.
- Extend `planWorldStateActions` so it can include a read-only `research.knowledge` action when research objectives exist, while preserving current provider-remediation mutation behavior.

**Research objective shape:**

```js
{
  schemaVersion: 1,
  kind: "research-objective",
  id,
  priority,
  reasonCode,
  query,
  topicIds,
  evidence: { providerIds?, objectiveIds?, workerIds?, knowledgeGapIds? },
  executionMode: "credit-free-research",
  mutation: false,
  creditCost: 0,
  paidFallback: false
}
```

Sources in this slice:
- provider errors;
- failed objectives;
- failed tasks/counts;
- unhealthy workers;
- explicit `knowledgeGaps` with `{ id, topicIds, summary, priority }`.

Do not synthesize secrets or raw private task content into queries. Queries are built from bounded IDs/reason categories and gap summaries already classified for research use.

- [ ] **Step 1: Write failing deterministic research-objective tests**

Cover ordering, dedupe, cap, healthy world -> empty objectives, provider quota failure -> research objective rather than core-loop halt, and all objectives mutation-free/zero-credit.

- [ ] **Step 2: Run and confirm missing-module failure**

Run: `node --test --test-isolation=none test/research-objectives.test.mjs`

- [ ] **Step 3: Implement research objective derivation**

- [ ] **Step 4: Extend objective planner tests first, then wire one aggregated research action**

The planner action should reference research-objective IDs/counts, not raw external content.

- [ ] **Step 5: Run focused planner tests**

Run: `node --test --test-isolation=none test/research-objectives.test.mjs test/objective-planner.test.mjs`

- [ ] **Step 6: Commit**

```bash
git add src/research-objectives.mjs src/objective-planner.mjs test/research-objectives.test.mjs test/objective-planner.test.mjs
git commit -m "feat: derive autonomous research objectives"
```

---

### Task 5: Assemble a model-independent universal learning foundation cycle

**Files:**
- Create: `src/universal-learning-foundation.mjs`
- Create: `test/universal-learning-foundation.test.mjs`
- Modify: `src/unattended-credit-free-cycle.mjs`
- Modify: `test/unattended-credit-free-cycle.test.mjs`

**Interfaces:**
- `runUniversalLearningFoundation({ snapshot, knowledgeGaps, evidenceInputs, priorCursors, contentVault, now })` -> frozen foundation result.
- Extend `runUnattendedCreditFreeCycle` with optional `researchSnapshot`, `knowledgeGaps`, `evidenceInputs`, `sourceCursors`, `contentVault`; when supplied, attach a metadata-only `research` summary to the cycle.

**Foundation result:**

```js
{
  schemaVersion: 1,
  kind: "universal-learning-foundation",
  observedAt,
  researchObjectives,
  evidenceReceipts,
  sourceCursors,
  changedEvidenceCount,
  unchangedEvidenceCount,
  externalModelRequired: false,
  creditCost: 0,
  paidFallback: false
}
```

The unattended cycle summary must contain only counts/IDs/hashes/cursors; no raw external body.

- [ ] **Step 1: Write failing foundation tests**

Required scenarios:
1. all external model providers unavailable and no local reasoner -> foundation still returns `kind`, research objectives, evidence hashes, and zero-credit health;
2. duplicate evidence -> zero changed count on second cycle;
3. evidence with instruction-like text cannot alter `nextAction`, provider, allowed paths, or mutation authority;
4. external evidence body is absent from serialized cycle receipt;
5. current heartbeat/foundry behavior remains present.

- [ ] **Step 2: Run and confirm missing-module failure**

Run: `node --test --test-isolation=none test/universal-learning-foundation.test.mjs`

- [ ] **Step 3: Implement the foundation coordinator**

Use Tasks 2-4 modules. If `contentVault` is absent, keep the normalized raw content only in the caller-local return long enough to hash it; do not persist it into cycle memory. If the caller requests durable raw retention, require a content vault.

- [ ] **Step 4: Extend unattended cycle with a metadata-only research summary**

Keep `fastLoop: "heartbeat"`; change slow-loop description only if tests are updated to the new explicit value, e.g. `"research-skill-compound-and-foundry"`. Preserve existing zero-credit contamination checks.

- [ ] **Step 5: Run focused regression tests**

Run: `node --test --test-isolation=none test/universal-learning-foundation.test.mjs test/unattended-credit-free-cycle.test.mjs test/unattended-cycle-memory.test.mjs test/heartbeat-ledger.test.mjs test/credit-free-skill-compound.test.mjs`

- [ ] **Step 6: Commit**

```bash
git add src/universal-learning-foundation.mjs src/unattended-credit-free-cycle.mjs test/universal-learning-foundation.test.mjs test/unattended-credit-free-cycle.test.mjs
git commit -m "feat: add model-independent universal learning foundation"
```

---

### Task 6: Make universal credit-independent routing the default orchestration substrate

**Files:**
- Modify: `src/autonomy-orchestrator.mjs`
- Modify: `test/autonomy-orchestrator.test.mjs`

**Behavior change:**
- `requestedMode: "hybrid"` no longer means Codex debate lanes are mandatory.
- The default objective starts with deterministic/local universal-loop tasks.
- Premium/included model providers are represented later as optional assistance, not required dependencies. This first plan does **not** implement the full provider-assistance router; it removes the hard dependency from the objective graph.
- Existing explicit Codex execution routes remain available for deliberately assigned implementation work.

**Target task skeleton:**

```text
observe -> research -> decide -> experiment/act -> verify -> repair -> integrate/report
```

The exact graph should reuse existing credit-free capabilities wherever possible and set `creditCost: 0`, `paidFallback: false` for the universal core tasks.

- [ ] **Step 1: Change tests first**

Replace the current assertion that hybrid mode produces four mandatory `codex.execute` tasks with assertions that:
- hybrid/default objectives contain no mandatory `primary-codex-builder` task;
- the objective remains implementable through local/repository/self-healer paths;
- verify/integrate remain dependency-gated;
- an explicit provider-assistance request may still create a separately optional provider task in a later slice, but absence of that task does not change core objective health.

- [ ] **Step 2: Run and confirm the current test fails on mandatory Codex lanes**

Run: `node --test --test-isolation=none test/autonomy-orchestrator.test.mjs`

- [ ] **Step 3: Refactor `buildAutonomyObjective` so universal credit-independent work is the default substrate**

Do not remove the `codexTask` helper if it is still used by explicit implementation dispatches elsewhere. Remove only the automatic mandatory chain from ordinary hybrid/default objectives.

- [ ] **Step 4: Run orchestrator and routing regressions**

Run: `node --test --test-isolation=none test/autonomy-orchestrator.test.mjs test/credit-free-autonomy.test.mjs test/objective-planner.test.mjs test/world-state-observer.test.mjs`

- [ ] **Step 5: Commit**

```bash
git add src/autonomy-orchestrator.mjs test/autonomy-orchestrator.test.mjs
git commit -m "feat: make universal zero-credit loop the default substrate"
```

---

### Task 7: Add an interactive internal/external read-only probe

**Files:**
- Create: `src/universal-learning-probe.mjs`
- Create: `scripts/universal-learning-probe.mjs`
- Create: `test/universal-learning-probe.test.mjs`
- Modify: `package.json`

**Interfaces:**
- `runInternalLearningProbe({ now })` -> deterministic synthetic receipt.
- `runExternalLearningProbe({ url, fetchImpl = fetch, now, timeoutMs = 10_000, maximumBytes = 1_048_576 })` -> read-only external evidence receipt.
- `runUniversalLearningProbe({ mode, url, fetchImpl, now })` -> combined receipt.
- CLI modes: `internal`, `external`, `all`.

**Default external URL:** `https://api.github.com/repos/michaeljwilliams0123/mahoraga`

The CLI must send only:
- method `GET`;
- `accept: application/vnd.github+json`;
- a fixed non-secret user-agent;
- no authorization/cookie headers.

Boundaries:
- HTTPS only;
- redirect policy `error` for the first slice;
- timeout <= 10 seconds;
- body cap <= 1 MiB;
- response status must be `200`;
- no code execution from response body;
- no persistence unless a caller explicitly supplies a content vault outside the CLI probe.

**Probe receipt:**

```js
{
  schemaVersion: 1,
  kind: "universal-learning-interactive-probe",
  mode,
  internal: { status, researchObjectiveCount, changedEvidenceCount, creditCost: 0 },
  external: { status, sourceId, contentSha256, sizeBytes, creditCost: 0 } | null,
  externalModelRequired: false,
  paidFallback: false
}
```

- [ ] **Step 1: Write failing probe tests with injected fake `fetchImpl`**

Cover success, HTTP failure, oversized response, timeout/abort, redirect rejection contract, and assert that fake external body containing an instruction cannot add executable fields to the receipt.

- [ ] **Step 2: Run and confirm missing-module failure**

Run: `node --test --test-isolation=none test/universal-learning-probe.test.mjs`

- [ ] **Step 3: Implement testable probe module and thin CLI**

- [ ] **Step 4: Add package script**

Add:

```json
"universal-loop:probe": "node scripts/universal-learning-probe.mjs all"
```

Do not reorder unrelated scripts.

- [ ] **Step 5: Run the internal interactive probe locally**

Run: `node scripts/universal-learning-probe.mjs internal`

Expected: JSON receipt with `internal.status === "ok"`, `creditCost === 0`, `paidFallback === false`.

- [ ] **Step 6: Run focused tests**

Run: `node --test --test-isolation=none test/universal-learning-probe.test.mjs test/universal-learning-foundation.test.mjs`

- [ ] **Step 7: Commit**

```bash
git add src/universal-learning-probe.mjs scripts/universal-learning-probe.mjs test/universal-learning-probe.test.mjs package.json
git commit -m "feat: add universal learning interactive probe"
```

---

### Task 8: Protect the new foundation in the self-healer release baseline

**Files:**
- Modify: `src/repair.mjs`
- Modify: `test/repair.test.mjs`
- Create by baseline refresh: `state/release-baseline/src/pr-text-sanitizer.mjs`
- Create by baseline refresh: `state/release-baseline/src/internet-evidence.mjs`
- Create by baseline refresh: `state/release-baseline/src/research-objectives.mjs`
- Create by baseline refresh: `state/release-baseline/src/universal-learning-foundation.mjs`
- Create by baseline refresh: `state/release-baseline/src/universal-learning-probe.mjs`
- Create by baseline refresh: `state/release-baseline/scripts/universal-learning-probe.mjs`
- Update by baseline refresh: `state/release-baseline/src/objective-planner.mjs`
- Update by baseline refresh: `state/release-baseline/src/unattended-credit-free-cycle.mjs`
- Update by baseline refresh: `state/release-baseline/src/autonomy-orchestrator.mjs`
- Update by baseline refresh: `state/release-baseline/src/repair.mjs`
- Update by baseline refresh: `state/release-baseline/package.json`

- [ ] **Step 1: Extend repair baseline test first**

Add the six new essential files to the required list in `test/repair.test.mjs`.

- [ ] **Step 2: Run and confirm missing essential entries**

Run: `node --test --test-isolation=none test/repair.test.mjs`

- [ ] **Step 3: Add the new files to `ESSENTIAL_FILES` in `src/repair.mjs`**

Keep deterministic ordering near related autonomy/evidence modules.

- [ ] **Step 4: Refresh the release baseline**

Run: `npm run baseline:refresh`

- [ ] **Step 5: Verify the release baseline and repair tests**

Run: `npm run baseline:verify`

Run: `node --test --test-isolation=none test/repair.test.mjs`

- [ ] **Step 6: Commit**

```bash
git add src/repair.mjs test/repair.test.mjs state/release-baseline
git commit -m "chore: protect universal learning foundation baseline"
```

---

### Task 9: Run internal and external interactive verification, then full repository verification

**Files:**
- No production files unless a test reveals a defect.
- If a defect is found, return to the owning task, add a regression test, fix it there, and commit before continuing.

- [ ] **Step 1: Run the complete focused foundation suite**

Run:

```bash
node --test --test-isolation=none \
  test/pr-text-sanitizer.test.mjs \
  test/review-transport-policy.test.mjs \
  test/internet-evidence.test.mjs \
  test/internet-evidence-vault.test.mjs \
  test/research-objectives.test.mjs \
  test/objective-planner.test.mjs \
  test/universal-learning-foundation.test.mjs \
  test/universal-learning-probe.test.mjs \
  test/unattended-credit-free-cycle.test.mjs \
  test/unattended-cycle-memory.test.mjs \
  test/autonomy-orchestrator.test.mjs \
  test/repair.test.mjs
```

Expected: 0 failures.

- [ ] **Step 2: Run internal interactive probe**

Run: `node scripts/universal-learning-probe.mjs internal`

Verify:
- `status: ok`;
- at least one deterministic research objective from the synthetic degraded world;
- no external model required;
- zero credit and no paid fallback;
- serialized receipt contains no raw evidence body.

- [ ] **Step 3: Run external interactive probe against the public Mahoraga GitHub API**

Run: `node scripts/universal-learning-probe.mjs external --url https://api.github.com/repos/michaeljwilliams0123/mahoraga`

Verify:
- one successful bounded HTTPS GET;
- source metadata and SHA-256 returned;
- no credentials attached;
- no mutation request emitted;
- response content remains evidence-only;
- zero model credits.

If the execution environment has no outbound network, record the probe as `network-unavailable` rather than fabricating success; the mocked external integration test must still pass.

- [ ] **Step 4: Run one second external delta probe using the same response fixture/cursor**

Use the test harness to prove unchanged content produces `changed: false`. Do not repeatedly fetch the live endpoint just to consume bandwidth.

- [ ] **Step 5: Run full repository verification once**

Run: `npm run verify`

Expected: all validation, product identity, coordination, self-upgrade, GitHub audit/live protection, PDF authority, release baseline, and Node tests pass.

- [ ] **Step 6: Confirm no Codex review trigger appears in candidate PR metadata before opening the implementation PR**

Use `sanitizePullRequestMetadata` on the intended title/body and assert `containsCodexMentionTrigger(...) === false` for both fields.

- [ ] **Step 7: Open a same-repository PR from an eligible branch prefix and allow exact-head Ubuntu/Windows Verify to decide integration eligibility**

Do not request reviewers, do not create a Codex review request, do not post PR comments/reactions, and do not treat Vercel provider/deployment status as a completion gate.

---

## Follow-on plans after this foundation is green

This plan intentionally stops after the foundation and interactive proof. The approved design then continues as separate independently revertible plans:

1. **Knowledge and negative-memory plane** — durable claim graph, contradiction handling, negative knowledge, skill confidence.
2. **Hypothesis/experiment evolution plane** — novelty scoring, bounded hypotheses, experiment receipts, candidate graduation.
3. **Provider assistance hierarchy** — local open-weight -> owner's included Codex -> Destiny route-verified capacity -> other zero-additional-cost assistants; no mandatory provider dependency.
4. **Level-7 adapter** — narrow bridge from experimental cognition output into normal candidate/evidence contracts without direct production authority.
5. **Adaptive long-running research scheduler** — historical bootstrap, delta research, source volatility backoff, contradiction refresh, and event-driven research.
6. **Policy-friction cleanup** — replace routine uncertainty stops with investigate/sandbox/corroborate behavior while preserving credential, uncontrolled-spend, ownership/recovery, and platform-policy boundaries.

## Completion criteria for this plan

- The ordinary autonomy objective no longer requires Codex capacity to begin or continue core work.
- Accidental Codex mention triggers are removed at the transport-text boundary.
- Mahoraga can deterministically derive research objectives from its own world-state gaps.
- Public external bytes can be content-addressed, cursor-deduplicated, and optionally vaulted without gaining execution authority.
- The unattended zero-credit cycle can carry research metadata without persisting raw external text.
- Internal and external interactive probe paths produce verifiable zero-credit receipts.
- New essential modules are covered by the self-healer baseline.
- `npm run verify` and exact-head Ubuntu/Windows verification are green before integration.
