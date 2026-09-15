# Mahoraga Operating Doctrine Contract Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Mahoraga's current operating doctrine durable, machine-checkable, and enforced by the normal Verify gate.

**Architecture:** Store critical invariants in `config/operating-doctrine.json`, explain them in `docs/MAHORAGA-OPERATING-DOCTRINE.md`, and enforce both through one focused Node test. `AGENTS.md` and Copilot instructions must point to the doctrine so future agents encounter it before substantive edits.

**Tech Stack:** Node 24 ESM, `node:test`, JSON configuration, Markdown governance documents, GitHub exact-head Verify.

**Spec:** `docs/superpowers/specs/2026-09-15-operating-doctrine-design.md`

## Global Constraints

- GitHub protected `main` remains source authority.
- SD009WC7 is the gold-standard reference execution plane, not a source-authority override.
- Source, deployment, live-runtime, provider-readiness, execution-authority, and verification truth remain separate.
- No automatic paid/licensed fallback for zero-credit work.
- Real cloud acceptance requires owner auth, encrypted relay, AuthorityDecision, admitted zero-credit provider, real model execution, persistence, and returned answer.
- Never bypass protected checks, weaken auth/readiness, or commit secrets/local machine paths.

---

### Task 1: Machine-readable doctrine contract

**Files:**
- Create: `config/operating-doctrine.json`
- Create: `test/operating-doctrine-contract.test.mjs`

**Interfaces:**
- Consumes: repository root and `config/operating-doctrine.json`.
- Produces: a JSON object with `schemaVersion`, `authorityOrder`, `referencePlane`, `convergence`, `acceptanceVertical`, `antiDuplication`, and `hardStops`.

- [ ] **Step 1: Write the failing contract test**

Create a `node:test` file that loads `config/operating-doctrine.json` and asserts the exact authority order, SD00 reference-plane role, exact-head cross-platform verification, Railway exact-SHA promotion, no paid fallback, stale-branch absorption rule, and the full real acceptance vertical.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node --test test/operating-doctrine-contract.test.mjs`
Expected: FAIL because `config/operating-doctrine.json` does not exist.

- [ ] **Step 3: Add the minimal JSON contract**

The JSON must declare `schemaVersion: 1`, `sourceAuthority: "github-main"`, `referencePlane.device: "SD009WC7"`, `referencePlane.role: "gold-standard-reference"`, `referencePlane.mayOverrideSourceAuthority: false`, required Verify contexts `Verify (ubuntu-latest)` and `Verify (windows-latest)`, `cloud.canonicalProvider: "railway"`, `cloud.requireExactMergedSha: true`, `zeroCredit.allowPaidFallback: false`, and the acceptance steps in order.

- [ ] **Step 4: Run focused test and verify GREEN**

Run: `node --test test/operating-doctrine-contract.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit the machine contract**

Run: `git add config/operating-doctrine.json test/operating-doctrine-contract.test.mjs && git commit -m "feat(governance): enforce operating doctrine contract"`

### Task 2: Human doctrine and agent entry points

**Files:**
- Create: `docs/MAHORAGA-OPERATING-DOCTRINE.md`
- Modify: `AGENTS.md`
- Modify: `.github/copilot-instructions.md`
- Modify: `test/operating-doctrine-contract.test.mjs`

**Interfaces:**
- Consumes: `config/operating-doctrine.json` as the machine contract.
- Produces: one human doctrine and mandatory entry-point references for coding agents.

- [ ] **Step 1: Extend the test to require doctrine references**

Assert that `AGENTS.md` and `.github/copilot-instructions.md` both reference `docs/MAHORAGA-OPERATING-DOCTRINE.md`, and that the doctrine explicitly distinguishes `/api/live` from `/api/ready`, names SD009WC7 as reference-only, and states that simulator/UI evidence is not real execution proof.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node --test test/operating-doctrine-contract.test.mjs`
Expected: FAIL because the doctrine file and entry-point references are absent.

- [ ] **Step 3: Add the doctrine and entry-point references**

Document the truth hierarchy, standard convergence loop, branch-mining/anti-duplication rules, acceptance vertical, generated-report exclusion, GitLab secondary-assurance role, proactive parallel-work rule, and hard-stop boundaries. Add a concise mandatory pointer near the top of both agent instruction files.

- [ ] **Step 4: Run focused test and verify GREEN**

Run: `node --test test/operating-doctrine-contract.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit the human contract**

Run: `git add docs/MAHORAGA-OPERATING-DOCTRINE.md AGENTS.md .github/copilot-instructions.md test/operating-doctrine-contract.test.mjs && git commit -m "docs(governance): codify Mahoraga operating doctrine"`

### Task 3: Repository-wide verification and integration readiness

**Files:**
- Verify all changed files from Tasks 1-2.

- [ ] **Step 1: Run syntax/whitespace checks**

Run: `git diff origin/main...HEAD --check`
Expected: no output and exit 0.

- [ ] **Step 2: Run focused contract test**

Run: `node --test test/operating-doctrine-contract.test.mjs`
Expected: all tests pass.

- [ ] **Step 3: Run full repository verification**

Run: `npm.cmd run verify`
Expected: exit 0 with zero failed tests.

- [ ] **Step 4: Re-fetch authoritative main before push**

Run: `git fetch origin main && git log --oneline --decorate -3 origin/main && git merge-base --is-ancestor origin/main HEAD`
Expected: HEAD contains current `origin/main`; if not, rebase and repeat focused/full verification.

- [ ] **Step 5: Push and open a protected-main PR**

Push `docs/operating-doctrine-20260915`, require exact-head Ubuntu/Windows Verify, and merge only after both pass. Confirm canonical Railway deploys the exact merge SHA before treating cloud convergence as current.
