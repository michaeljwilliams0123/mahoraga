# Copilot Harness Assist Fabric Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a sanitized, harness-aware Microsoft capability layer to Mahoraga so GitHub Copilot harness agents can be discovered and ranked without consuming Copilot Credits, while all known credit-consuming harness activity remains blocked by the default zero-credit policy.

**Architecture:** Extend the existing Power Platform/Copilot Studio provider family in PR #302 instead of creating a second Microsoft router. Introduce a strict harness descriptor and topology projector, add an explicit `metered-copilot-credit` billing class, and surface provider-side harness metadata to UCF as non-executable evidence until an explicit spending policy later admits execution.

**Tech Stack:** Node.js 24 ESM, `node:test`, existing UCF capability registry/router, existing Power Platform provider, existing Microsoft billing firewall.

**Spec:** `docs/superpowers/specs/2026-09-11-copilot-harness-assist-fabric-design.md`

## Global Constraints

- Mahoraga remains the canonical planner, authority resolver, cost resolver, verifier, and mutation owner.
- GitHub Copilot harness runtime/build/test/evaluate operations are `metered-copilot-credit` under Microsoft's current billing model.
- Standard-harness execution can be `license-included` only when runtime/provider evidence proves the exact covered route.
- Read-only metadata discovery/normalization must not invoke a harness model and remains `deterministic-zero`.
- Raw tenant IDs, agent GUIDs, user identities, URLs, prompts, transcripts, tokens, knowledge contents, or Microsoft-managed memory contents must not enter harness descriptors or receipts.
- Unknown harness identity must remain `unknown`; never infer harness type from an agent display name.
- Connected-agent topology is metadata only in this increment and is bounded to prevent unbounded recursion/fan-out.
- `metered-copilot-credit` and `unknown` remain ineligible when provider policy is `zero-credit` or `credit-free`.
- No new generic tunnel, arbitrary shell, caller-selected executable, or human messaging capability is introduced.

---

### Task 1: Explicit harness billing firewall

**Files:**
- Modify: `src/microsoft-usage-cost.mjs`
- Modify: `src/config.mjs`
- Modify: `test/microsoft-usage-cost.test.mjs`
- Modify: `test/power-platform-ucf.test.mjs`

**Interfaces:**
- Extend billing classes with `metered-copilot-credit`.
- Produce `classifyCopilotHarnessUsage({ harnessType, operation, runtimeAttestation })`.
- Known GitHub Copilot harness operations `execute`, `build`, `test`, and `evaluate` return `metered-copilot-credit` regardless of license attestation.
- Metadata operations `discover`, `inspect-metadata`, and `project-topology` return `deterministic-zero`.

- [ ] **Step 1: Write failing billing tests**
- [ ] **Step 2: Run targeted tests and capture RED**
- [ ] **Step 3: Implement the new billing class and harness usage classifier**
- [ ] **Step 4: Run targeted tests and confirm GREEN**
- [ ] **Step 5: Commit**

### Task 2: Sanitized harness descriptor

**Files:**
- Create: `src/copilot-harness-descriptor.mjs`
- Create: `test/copilot-harness-descriptor.test.mjs`

**Interfaces:**
- Produce `createCopilotHarnessDescriptor(input)`.
- Produce `validateCopilotHarnessDescriptor(value)`.
- Produce `buildCopilotHarnessTopology(descriptors, { maximumConnectedAgents = 8, maximumDepth = 2 })`.
- Supported harness types: `standard-harness`, `copilot-chat-harness`, `github-copilot-harness`, `unknown`.
- Descriptor contains only logical aliases, bounded category lists, fingerprints, status booleans, model/memory/evaluation/monitor metadata, data/authority classes, billing class, zero-credit eligibility, and timestamps.

- [ ] **Step 1: Write failing descriptor/topology tests**
- [ ] **Step 2: Run tests and capture RED because the module does not exist**
- [ ] **Step 3: Implement strict normalization, secret/identifier rejection, and immutable topology projection**
- [ ] **Step 4: Confirm GREEN**
- [ ] **Step 5: Commit**

### Task 3: Power Platform discovery projection

**Files:**
- Modify: `src/power-platform-provider.mjs`
- Modify: `src/power-platform-worker.mjs`
- Modify: `test/power-platform-provider.test.mjs`
- Modify: `test/power-platform-worker.test.mjs`

**Interfaces:**
- `discoverPowerPlatformAgents()` continues to return safe PAC-derived agent readiness.
- Add optional authorized `harnessMetadataByAlias` input; unprovided harness type remains `unknown`.
- `powerplatform.discover` returns bounded harness descriptor summaries/topology when supplied without changing the zero-credit execution path.
- Discovery never invokes Preview, Evaluate, authoring, or agent runtime.

- [ ] **Step 1: Write failing discovery projection tests**
- [ ] **Step 2: Capture RED**
- [ ] **Step 3: Add descriptor projection with unknown-by-default harness identity**
- [ ] **Step 4: Confirm serialized results contain no GUID/email/raw URL/token/private content**
- [ ] **Step 5: Confirm GREEN and commit**

### Task 4: UCF harness evidence integration

**Files:**
- Modify: `src/capability-registry.mjs`
- Modify: `test/power-platform-ucf.test.mjs`

**Interfaces:**
- Accept `context.microsoftHarnessDescriptors` as sanitized provider evidence.
- Attach matching harness metadata only to the existing `copilot-studio` provider route evidence; do not create executable metered routes in this increment.
- Preserve zero-credit admission as the execution gate.

- [ ] **Step 1: Write failing registry-evidence tests**
- [ ] **Step 2: Capture RED**
- [ ] **Step 3: Attach sanitized harness evidence to route decisions without changing authority**
- [ ] **Step 4: Confirm GitHub Copilot harness evidence stays diagnosable but non-executable under zero-credit policy**
- [ ] **Step 5: Confirm GREEN and commit**

### Task 5: Full verification and PR readiness

**Files:**
- Modify: `docs/superpowers/specs/2026-09-11-copilot-harness-assist-fabric-design.md` only to mark implementation state accurately.
- Update PR #302 description with implemented scope and exact verification SHA.

- [ ] **Step 1: Run focused harness/Power Platform/UCF tests**
- [ ] **Step 2: Run full `npm.cmd run verify`**
- [ ] **Step 3: Check `git diff --check` equivalent through CI/static checks**
- [ ] **Step 4: Require exact-head Ubuntu + Windows verification**
- [ ] **Step 5: Resolve blocking review/security findings**
- [ ] **Step 6: Mark #302 ready only after current-head checks are green**
