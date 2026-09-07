# Level 8 Institutional Memory + Organizational Agent Graph Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement Level-8 Waves 5–6 as one independently mergeable cognition/organization chunk: durable institutional-memory contracts plus a deterministic organizational-agent graph layered on the existing Agent Foundry and shared feat ledger.

**Architecture:** Add one append-oriented institutional-memory module and one organizational-agent-graph module. Both remain deterministic, zero-credit, provider-independent ESM contracts. Institutional memory distinguishes observation, knowledge, validated procedure, negative memory, source reliability, and outcome records with provenance/freshness/supersession. The organizational graph composes existing child-agent manifests into a singular-entity hierarchy, creates units only from real workload/capability gaps, and routes learned feat IDs back to shared memory rather than inventing independent authorities.

**Tech Stack:** Node.js 24+, ESM `.mjs`, `node:crypto`, built-in `node:test`, existing `src/agent-foundry.mjs`, existing `src/agent-feat-ledger.mjs`, existing Mahoraga Verify workflow.

**Spec:** `docs/superpowers/specs/2026-09-07-level8-entity-runtime-design.md`

## Global Constraints

- GitHub `main` remains authoritative; implementation happens on a bounded branch/PR.
- TDD: prove RED before adding implementation modules.
- Required Ubuntu and Windows exact-head Verify remain the code gates even while the GitHub ruleset is temporarily absent.
- No Codex code review, no automated PR comments/reviews/reactions, and no literal integration-trigger mention in generated PR metadata.
- Vercel is observational only.
- Core behavior must function with zero frontier-model credits and no provider availability.
- Stable IDs, schemaVersion, deterministic ordering, canonical timestamps, explicit provenance, explicit state, bounded text/lists, immutable outputs.
- No network calls, shell execution, credential handling, browser authority, or direct repository mutation in Waves 5–6.
- The entity remains singular. Organizational units are internal functions and cannot become independent production authorities.

---

### Task 1: RED contract suite

**Files:**
- Create: `test/entity-runtime-memory-organization.test.mjs`

**Interfaces:**
- Expects `createInstitutionalMemoryRecord(input, options)`.
- Expects `validateInstitutionalMemoryRecord(record)`.
- Expects `reconcileInstitutionalMemory({ records, incoming, now })`.
- Expects `queryInstitutionalMemory({ records, classes, objectiveId, capability, includeSuperseded, limit })`.
- Expects `createOrganizationUnit(input, options)`.
- Expects `validateOrganizationUnit(unit)`.
- Expects `buildOrganizationalAgentGraph({ entityId, parentAgentId, existingAgents, units, workloadGaps, featLedger, createdAt })`.
- Expects `planOrganizationUnits({ entityId, parentAgentId, existingAgents, existingUnits, workloadGaps, createdAt })`.

- [ ] **Step 1: Write the failing test.**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createInstitutionalMemoryRecord,
  reconcileInstitutionalMemory,
  queryInstitutionalMemory,
} from '../src/institutional-memory.mjs';
import {
  createOrganizationUnit,
  planOrganizationUnits,
  buildOrganizationalAgentGraph,
} from '../src/organizational-agent-graph.mjs';

const NOW = '2026-09-07T06:30:00.000Z';

test('negative memory is retained and linked to evidence without provider calls', () => {
  const failure = createInstitutionalMemoryRecord({
    memoryClass: 'negative-memory',
    subject: 'repository-verification',
    statement: 'Retrying stale exact-head evidence does not prove the current candidate.',
    provenance: 'verified-outcome',
    confidence: 1,
    freshness: 'current',
    objectiveIds: ['obj-level8'],
    evidenceRefs: ['receipt-verify-stale'],
    capability: 'repository-verify',
    supersedes: [],
  }, { observedAt: NOW });

  const ledger = reconcileInstitutionalMemory({ records: [], incoming: [failure], now: NOW });
  assert.equal(ledger.records.length, 1);
  assert.equal(ledger.records[0].memoryClass, 'negative-memory');
  assert.equal(ledger.records[0].zeroCredit, true);
  assert.equal(ledger.records[0].providerRequired, false);
  assert.equal(Object.isFrozen(ledger.records[0]), true);
});

test('validated procedure supersedes synthesized knowledge but history remains queryable', () => {
  const knowledge = createInstitutionalMemoryRecord({
    memoryClass: 'knowledge',
    subject: 'exact-head-verification',
    statement: 'Verify candidate head before integration.',
    provenance: 'synthesized',
    confidence: 0.9,
    freshness: 'current',
    objectiveIds: ['obj-level8'],
    evidenceRefs: ['receipt-a'],
    capability: 'repository-verify',
    supersedes: [],
  }, { observedAt: NOW });
  const procedure = createInstitutionalMemoryRecord({
    memoryClass: 'procedure',
    subject: 'exact-head-verification',
    statement: 'Read candidate SHA, run Ubuntu and Windows Verify for that SHA, discard stale evidence after any head change.',
    provenance: 'verified-outcome',
    confidence: 1,
    freshness: 'current',
    objectiveIds: ['obj-level8'],
    evidenceRefs: ['receipt-b'],
    capability: 'repository-verify',
    supersedes: [knowledge.memoryId],
  }, { observedAt: NOW });
  const ledger = reconcileInstitutionalMemory({ records: [knowledge], incoming: [procedure], now: NOW });
  assert.equal(ledger.records.length, 2);
  assert.equal(queryInstitutionalMemory({ records: ledger.records, capability: 'repository-verify' }).length, 1);
  assert.equal(queryInstitutionalMemory({ records: ledger.records, capability: 'repository-verify', includeSuperseded: true }).length, 2);
});

test('organization planner creates only uncovered workload functions', () => {
  const existingAgents = [];
  const existingUnits = [createOrganizationUnit({
    unitId: 'research-director',
    role: 'research-director',
    mission: 'Coordinate evidence acquisition for unresolved objectives.',
    capabilities: ['research-evidence'],
    workloadClasses: ['research'],
    persistent: true,
  }, { createdAt: NOW })];
  const plans = planOrganizationUnits({
    entityId: 'mahoraga',
    parentAgentId: 'mahoraga-core',
    existingAgents,
    existingUnits,
    workloadGaps: [
      { id: 'research-evidence', state: 'open', priority: 'high', workloadClass: 'research', summary: 'Need external evidence.', dependency: 'internet-egress' },
      { id: 'artifact-analysis', state: 'open', priority: 'high', workloadClass: 'analysis', summary: 'Need artifact synthesis.', dependency: 'artifact-store' },
    ],
    createdAt: NOW,
  });
  assert.deepEqual(plans.map((plan) => plan.gapId), ['artifact-analysis']);
});

test('organizational graph keeps Mahoraga singular and returns shared feat IDs', () => {
  const unit = createOrganizationUnit({
    unitId: 'repository-engineering',
    role: 'repository-engineering',
    mission: 'Implement and verify repository improvements.',
    capabilities: ['repository-verify'],
    workloadClasses: ['engineering'],
    persistent: true,
  }, { createdAt: NOW });
  const graph = buildOrganizationalAgentGraph({
    entityId: 'mahoraga',
    parentAgentId: 'mahoraga-core',
    existingAgents: [],
    units: [unit],
    workloadGaps: [],
    featLedger: {
      schemaVersion: 1,
      sourceFingerprint: 'a'.repeat(64),
      feats: [{ schemaVersion: 1, featId: 'feat-' + 'b'.repeat(24), agentId: 'mahoraga-repository-engineering-specialist', capability: 'repository-verify', outcome: 'success', summary: 'Verified exact-head candidate.', evidence: ['receipt-1'], learnedAt: NOW, zeroCredit: true, reusable: true }],
      reusableFeatIds: ['feat-' + 'b'.repeat(24)],
      byAgent: {},
    },
    createdAt: NOW,
  });
  assert.equal(graph.entityId, 'mahoraga');
  assert.equal(graph.singularAuthority, true);
  assert.deepEqual(graph.sharedFeatIds, ['feat-' + 'b'.repeat(24)]);
  assert.equal(graph.units.length, 1);
});
```

- [ ] **Step 2: Push RED commit and open PR.**
- [ ] **Step 3: Confirm required Verify fails because `institutional-memory.mjs` and `organizational-agent-graph.mjs` are missing, not because of syntax or unrelated baseline failure.**

### Task 2: Institutional Memory

**Files:**
- Create: `src/institutional-memory.mjs`

**Interfaces:**
- Produces `createInstitutionalMemoryRecord(input, { observedAt })`.
- Produces `validateInstitutionalMemoryRecord(record)`.
- Produces `reconcileInstitutionalMemory({ records, incoming, now })` returning `{ schemaVersion, records, activeMemoryIds, supersededMemoryIds, fingerprint }`.
- Produces `queryInstitutionalMemory({ records, classes, objectiveId, capability, includeSuperseded = false, limit = 100 })`.

- [ ] **Step 1: Implement strict memory classes and provenance enums.**

```js
const MEMORY_CLASSES = new Set([
  'fact', 'observation', 'knowledge', 'strategy', 'outcome', 'failure',
  'source-reliability', 'procedure', 'learned-capability', 'stakeholder-pattern',
  'system-pattern', 'negative-memory',
]);
const PROVENANCE = new Set(['owner-explicit', 'connected-evidence', 'verified-outcome', 'synthesized', 'entity-inference']);
const FRESHNESS = new Set(['current', 'aging', 'stale']);
```

- [ ] **Step 2: Derive deterministic IDs from canonical record content.**

```js
const memoryId = `mem-${createHash('sha256').update(JSON.stringify(core)).digest('hex').slice(0, 32)}`;
```

- [ ] **Step 3: Validate bounded lists/text, confidence 0..1, canonical timestamps, sorted unique references, and immutable zero-credit flags.**
- [ ] **Step 4: Reconcile append-oriented history.** Exact duplicate `memoryId` coalesces. A record may supersede existing IDs but does not erase them. Unknown supersession targets fail closed. Circular/self supersession fails closed. Active IDs are all records not superseded by another retained record.
- [ ] **Step 5: Implement deterministic query filtering and default exclusion of superseded records.**
- [ ] **Step 6: Run focused suite; memory tests must pass while organization tests remain RED until Task 3.**
- [ ] **Step 7: Commit `feat: add Level 8 institutional memory`.**

### Task 3: Organizational Agent Graph

**Files:**
- Create: `src/organizational-agent-graph.mjs`
- Reuse without breaking: `src/agent-foundry.mjs`
- Reuse without breaking: `src/agent-feat-ledger.mjs`

**Interfaces:**
- Produces `createOrganizationUnit(input, { createdAt })`.
- Produces `validateOrganizationUnit(unit)`.
- Produces `planOrganizationUnits({ entityId, parentAgentId, existingAgents, existingUnits, workloadGaps, createdAt })`.
- Produces `buildOrganizationalAgentGraph({ entityId, parentAgentId, existingAgents, units, workloadGaps, featLedger, createdAt })`.

- [ ] **Step 1: Define strict unit schema.**

```js
{
  schemaVersion: 1,
  unitId,
  role,
  mission,
  capabilities,
  workloadClasses,
  persistent,
  authority: 'internal-function',
  sharedMemory: true,
  sharedFeatLedger: true,
  zeroCredit: true,
  createdAt,
}
```

- [ ] **Step 2: Convert uncovered workload gaps into existing Agent Foundry-compatible plans.** Use `planChildAgents` for child-manifest semantics rather than inventing a second agent registry. Existing unit capabilities and existing child-agent capabilities both count as coverage. Completed/closed gaps do not create units.
- [ ] **Step 3: Prevent redundant units.** Same capability/workload coverage must not create a second unit; conflicts on a stable `unitId` fail closed.
- [ ] **Step 4: Build singular organizational graph.** Graph output includes `entityId`, `parentAgentId`, `singularAuthority: true`, deterministically ordered units, child-agent manifests/plans, uncovered gaps, and reusable `sharedFeatIds` from the validated feat ledger.
- [ ] **Step 5: Ensure graph never changes platform authorization boundaries in child manifests.** Child manifests continue to require platform authorization and remain internal functions.
- [ ] **Step 6: Run focused suite; all tests pass.**
- [ ] **Step 7: Commit `feat: add Level 8 organizational agent graph`.**

### Task 4: Pressure tests and integration

**Files:**
- Modify: `test/entity-runtime-memory-organization.test.mjs`

- [ ] **Step 1: Add schema rejection pressure cases.** Unknown memory class, invalid confidence, duplicate evidence refs, non-canonical timestamps, self-supersession, unknown supersession target, duplicate unit IDs with conflicting definitions, overlong mission, malformed workload gap.
- [ ] **Step 2: Add deterministic behavior cases.** Reversing input record/unit order must yield the same fingerprint and sorted graph projection.
- [ ] **Step 3: Add zero-provider degradation case.** Pass no provider/model context; memory reconcile and organization planning remain functional and return `zeroCredit: true` / no provider dependency.
- [ ] **Step 4: Add negative-memory reuse case.** Querying `negative-memory` by capability returns prior failed approaches so later waves can avoid repeating them.
- [ ] **Step 5: Run focused tests repeatedly enough to detect ordering/idempotency flakiness.**
- [ ] **Step 6: Push final candidate and require exact-head Ubuntu + Windows Verify.**
- [ ] **Step 7: Re-read candidate head after green evidence; if changed, discard stale proof and re-run.**
- [ ] **Step 8: Merge only the exact verified head.**
- [ ] **Step 9: Re-read `main` and record the merge SHA for the Waves 7–8 branch.**
