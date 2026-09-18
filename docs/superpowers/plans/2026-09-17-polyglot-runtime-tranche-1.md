# Mahoraga Polyglot Runtime — Tranche 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish Mahoraga's strict polyglot foundation and migrate one complete assistant-answer vertical slice from untyped Node ESM JavaScript to native Node 24 TypeScript without changing security, routing, deployment, or user-visible behavior.

**Architecture:** TypeScript becomes the canonical control-plane language through Node 24 native type stripping plus a strict `tsc --noEmit` gate. A language-neutral contract directory defines cross-language worker envelopes, and the first migrated vertical slice proves the pattern by moving answer-quality and assistant-result contracts to TypeScript while preserving runtime behavior and release-baseline equality.

**Tech Stack:** Node.js 24, TypeScript 7, Node native TypeScript type stripping, Zod 4 for runtime validation where boundary data is untrusted, Node test runner, SQLite, Next.js 16, GitHub Actions, Railway.

**Spec:** `docs/superpowers/specs/2026-09-17-polyglot-runtime-architecture-design.md`

## Global Constraints

- TypeScript is the default application and control-plane language.
- Root TypeScript uses `strict: true`, `noEmit: true`, `module: "nodenext"`, `target: "esnext"`, `allowImportingTsExtensions: true`, `erasableSyntaxOnly: true`, `verbatimModuleSyntax: true`, `noUncheckedIndexedAccess: true`, and `exactOptionalPropertyTypes: true`.
- Runtime code must execute directly on Node 24 without requiring generated JavaScript.
- Railway remains the canonical cloud runtime.
- GitHub `main` remains source authority.
- Exact-head `Verify (ubuntu-latest)` and `Verify (windows-latest)` remain mandatory.
- Provider admission remains fail-closed.
- Zero-credit work never silently falls through to a paid or licensed provider.
- Raw 4782/4783 listeners remain non-public.
- Owner authentication, authority, and sovereignty boundaries are unchanged.
- Candidate code cannot approve itself under modified security/evolution rules.
- Governed source files mirrored under `state/release-baseline/` move byte-for-byte with their source.
- No second Mahoraga UI is created.
- PR #584's greeting behavior is preserved if it merges before this tranche lands.
- C++, Python, SQL, PowerShell, Bash, and other languages are not introduced as empty scaffolding; a language directory appears only with a real workload.
- C++ is not introduced in Tranche 1 because no benchmark-proven hot path has yet been established.

---

### Task 1: Root TypeScript execution and verification foundation

**Files:**
- Modify: `package.json`
- Create: `tsconfig.json`
- Create: `test/typescript-runtime-contract.test.ts`
- Modify: `.github/workflows/verify.yml`
- Modify: `state/release-baseline/package.json` only if the canonical baseline currently mirrors root package metadata
- Modify: `state/release-baseline/.github/workflows/verify.yml` if the workflow is governed by the release baseline

**Interfaces:**
- Consumes: Node 24 runtime and current `npm run verify`.
- Produces: `npm run typecheck`, a strict root TypeScript config, and CI ordering that type-checks before full behavioral verification.

- [ ] **Step 1: Write the failing runtime-contract test**

Create `test/typescript-runtime-contract.test.ts` that loads root `package.json` and `tsconfig.json`, asserting:
- a root `typecheck` script exists and runs `tsc --noEmit`;
- TypeScript is pinned in root `devDependencies`;
- all required strict compiler options match the Global Constraints;
- `allowJs` is false;
- `allowImportingTsExtensions` is true for direct Node-native `.ts` imports;
- `include` covers `src/**/*.ts`, `scripts/**/*.ts`, `relay/**/*.ts`, `test/**/*.ts`, and `contracts/**/*.ts`;
- `verify` invokes `npm run typecheck` before the full Node test suite.

Example assertion shape:

```js
test("root control plane has a strict native-TypeScript contract", () => {
  assert.equal(pkg.scripts.typecheck, "tsc --noEmit");
  assert.equal(tsconfig.compilerOptions.strict, true);
  assert.equal(tsconfig.compilerOptions.erasableSyntaxOnly, true);
  assert.equal(tsconfig.compilerOptions.noUncheckedIndexedAccess, true);
  assert.equal(tsconfig.compilerOptions.exactOptionalPropertyTypes, true);
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:
```bash
node --test test/typescript-runtime-contract.test.ts
```

Expected: FAIL because root `tsconfig.json`, root TypeScript dependency, and `typecheck` do not yet exist.

- [ ] **Step 3: Add the minimal root TypeScript toolchain**

Create `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "esnext",
    "module": "nodenext",
    "moduleResolution": "nodenext",
    "strict": true,
    "noEmit": true,
    "allowJs": false,
    "allowImportingTsExtensions": true,
    "erasableSyntaxOnly": true,
    "verbatimModuleSyntax": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "skipLibCheck": true,
    "types": ["node"]
  },
  "include": [
    "src/**/*.ts",
    "scripts/**/*.ts",
    "relay/**/*.ts",
    "test/**/*.ts",
    "contracts/**/*.ts"
  ],
  "exclude": [
    "node_modules",
    "cloud-app",
    "operator-deck",
    "state/release-baseline"
  ]
}
```

Update root `package.json`:
- add `typescript: "7.0.2"` and `@types/node: "26.4.0"` to `devDependencies`;
- add `"typecheck": "tsc --noEmit"`;
- prepend `npm run typecheck &&` to `verify`.

Update `.github/workflows/verify.yml` with a distinct `npm run typecheck` step before the authoritative repository verification so type failures are visible separately.

- [ ] **Step 4: Run focused verification**

Run:
```bash
npm install
node --test test/typescript-runtime-contract.test.ts
npm run typecheck
```

Expected: PASS. Typecheck may report no TypeScript inputs yet only if the config is invalid; the task is complete only when `tsc --noEmit` exits 0 with the committed configuration.

- [ ] **Step 5: Run baseline verification if governed mirrors changed**

Run:
```bash
node scripts/create-release-baseline.mjs --verify
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json tsconfig.json test/typescript-runtime-contract.test.ts .github/workflows/verify.yml state/release-baseline
git commit -m "build(typescript): establish strict native control-plane toolchain"
```

---

### Task 2: Polyglot language policy and repository guard

**Files:**
- Modify: `AGENTS.md`
- Modify: `docs/ECOSYSTEM-LOCK.md`
- Modify: `.github/copilot-instructions.md`
- Create: `config/language-policy.json`
- Create: `scripts/language-policy.ts`
- Create: `test/language-policy.test.ts`
- Modify: `package.json`
- Mirror governed files under `state/release-baseline/` when applicable

**Interfaces:**
- Consumes: root TypeScript toolchain from Task 1.
- Produces: machine-readable language policy plus deterministic `npm run language:verify`.

- [ ] **Step 1: Write the failing language-policy test**

Create `test/language-policy.test.ts` that imports `validateLanguagePolicy` from `../scripts/language-policy.ts` and asserts:
- TypeScript is the default for `src`, `scripts`, `relay`, and `test`;
- `cloud-app` and `operator-deck` remain TypeScript/TSX;
- SQL, Python, C++, PowerShell, and Bash are permitted only in declared specialized directories;
- C++ requires benchmark evidence;
- ordinary `.js/.mjs/.cjs` application/test files are migration debt, not an allowed target-state language;
- documented external-tool exceptions can be allowlisted explicitly;
- current repository state is reported as migration debt rather than immediate failure so the migration can proceed incrementally.

The initial test must also assert that `validateLanguagePolicy()` returns a structured result:
```ts
type LanguagePolicyReport = {
  healthy: boolean;
  migrationDebt: readonly string[];
  violations: readonly string[];
};
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:
```bash
node --test test/language-policy.test.ts
```

Expected: FAIL because the policy module does not exist.

- [ ] **Step 3: Implement the machine policy**

Create `config/language-policy.json` with:
- version `1`;
- default language `typescript`;
- directory rules for TypeScript/TSX, SQL, Python, C++, PowerShell, Bash;
- explicit `javascriptMigrationDebtExtensions: [".js", ".mjs", ".cjs"]`;
- `nativeCodeRequiresBenchmark: true`;
- an initially empty `javascriptExceptions` array.

Implement `scripts/language-policy.ts` using fixed repository roots and no caller-controlled executable paths. It must distinguish:
- `migrationDebt`: legacy JS/MJS/CJS inside migratable application/test paths;
- `violations`: new target-state files in the wrong language/directory or undocumented JS exceptions.

- [ ] **Step 4: Update human-readable governance**

Replace the old “control plane stays Node ESM `.mjs`” rule in:
- `AGENTS.md`;
- `docs/ECOSYSTEM-LOCK.md`;
- `.github/copilot-instructions.md`.

New rule:
> TypeScript is the canonical control-plane/runtime language. Existing `.mjs` is migration debt and must move in bounded verified tranches. Specialized languages are permitted only under `config/language-policy.json` and versioned contract boundaries. Do not mass-rewrite, create a parallel app, or weaken verification to accelerate migration.

Preserve all non-language security, release, network, rollback, review, and ownership rules verbatim in meaning.

- [ ] **Step 5: Wire deterministic verification**

Add:
```json
"language:verify": "node scripts/language-policy.ts"
```

to root scripts and include `npm run language:verify` in `verify` after typecheck and before the full test suite.

During migration, the command exits nonzero only for `violations`, not for pre-existing `migrationDebt`.

- [ ] **Step 6: Run focused tests**

Run:
```bash
node --test test/language-policy.test.ts
npm run language:verify
npm run typecheck
```

Expected: PASS with a non-empty migration-debt report and zero violations.

- [ ] **Step 7: Verify release baseline and commit**

Run:
```bash
node scripts/create-release-baseline.mjs --verify
```

Then:
```bash
git add AGENTS.md docs/ECOSYSTEM-LOCK.md .github/copilot-instructions.md config/language-policy.json scripts/language-policy.ts test/language-policy.test.ts package.json state/release-baseline
git commit -m "feat(governance): codify Mahoraga polyglot language policy"
```

---

### Task 3: Canonical TypeScript worker-result contract

**Files:**
- Create: `contracts/worker-result.ts`
- Create: `contracts/worker-result.schema.json`
- Create: `test/worker-result-contract.test.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: strict TypeScript toolchain.
- Produces:
  - `WorkerResult`;
  - `AssistantRespondResult`;
  - `isWorkerResult(value: unknown): value is WorkerResult`;
  - language-neutral JSON Schema for non-TypeScript workers.

Canonical TypeScript interfaces:

```ts
export type WorkerWaitingReason = string;
export type WorkerErrorCode = string;

export type CapabilityReceipt = Readonly<{
  id: string;
  outcome: "succeeded" | "failed" | "waiting";
}>;

export type WorkerResult<TOutput = unknown> =
  | Readonly<{ status: "completed"; receipt: CapabilityReceipt; output: TOutput }>
  | Readonly<{ status: "waiting"; reasonCode: WorkerWaitingReason }>
  | Readonly<{ status: "failed"; errorCode: WorkerErrorCode }>;

export type AssistantRespondOutput = Readonly<{
  answer: string;
}>;

export type AssistantRespondResult = WorkerResult<AssistantRespondOutput>;
```

- [ ] **Step 1: Write compile-time and runtime RED tests**

Create `test/worker-result-contract.test.ts` with runtime assertions for completed/waiting/failed shapes and a compile-time fixture that proves a completed assistant response without `answer` is rejected.

Use `// @ts-expect-error` exactly on the invalid object so removal of the error causes typecheck to fail.

- [ ] **Step 2: Run RED**

Run:
```bash
node --test test/worker-result-contract.test.ts
npm run typecheck
```

Expected: FAIL because the contract module/schema do not exist.

- [ ] **Step 3: Implement the TypeScript contract and validator**

Implement `contracts/worker-result.ts` with no runtime dependency beyond the standard library. The validator must reject arrays, missing status fields, completed results without a receipt/output, waiting results without `reasonCode`, and failed results without `errorCode`.

- [ ] **Step 4: Add the language-neutral JSON Schema**

Create `contracts/worker-result.schema.json` describing the same discriminated union using JSON Schema 2020-12. Keep it generic enough for Python/native workers but strict on the discriminant and required fields.

- [ ] **Step 5: Run focused verification**

Run:
```bash
node --test test/worker-result-contract.test.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add contracts/worker-result.ts contracts/worker-result.schema.json test/worker-result-contract.test.ts
git commit -m "feat(contracts): add typed polyglot worker result envelope"
```

---

### Task 4: Migrate answer-quality to native TypeScript

**Files:**
- Rename: `src/answer-quality.mjs` → `src/answer-quality.ts`
- Rename: `test/answer-quality.test.mjs` → `test/answer-quality.test.ts`
- Modify imports in every direct consumer of `src/answer-quality.mjs`
- Mirror: `state/release-baseline/src/answer-quality.ts`
- Remove: `state/release-baseline/src/answer-quality.mjs`
- Modify: release-baseline manifest/critical-file lists that name the old path
- Modify: `config/language-policy.json` migration-debt accounting if needed

**Interfaces:**
- Consumes: Task 3 worker-result types where assistant-result typing is relevant.
- Produces:
  - typed `AnswerQualityTask`;
  - typed `AnswerQualityResult`;
  - `evaluateAnswerQuality(...): AnswerQualityEvaluation`;
  - identical runtime behavior to the current module.

- [ ] **Step 1: Add a migration regression test before renaming**

Extend `test/typescript-runtime-contract.test.ts` to assert:
- `src/answer-quality.ts` exists;
- `src/answer-quality.mjs` does not exist;
- release-baseline uses the same `.ts` path;
- no repository consumer imports `answer-quality.mjs`.

Run the test before the rename.

Expected: FAIL on the current `.mjs` path.

- [ ] **Step 2: Rename and add types without behavior change**

Move the module to `src/answer-quality.ts`. Add explicit types for:
- task input;
- completion evidence;
- answer result;
- evaluator evidence;
- evaluator output.

Do not change regular expressions, tokenization, thresholds, error strings, or acceptance semantics except to preserve already-merged greeting behavior.

Use erasable TypeScript only: type aliases, interfaces, type annotations, `satisfies`, and `import type`. Do not introduce enums, namespaces, parameter properties, or other syntax requiring transformation.

- [ ] **Step 3: Migrate the focused test**

Rename `test/answer-quality.test.mjs` to `test/answer-quality.test.ts` and update its import to `../src/answer-quality.ts`.

Preserve all existing cases, including concise greeting acceptance if it is present on current `main`.

- [ ] **Step 4: Update direct consumers and governed-path lists**

Update all imports and hardcoded critical-file/path assertions from `answer-quality.mjs` to `answer-quality.ts`.

Update the exact release-baseline mirror in the same change.

- [ ] **Step 5: Run focused verification**

Run:
```bash
node --test test/answer-quality.test.ts test/typescript-runtime-contract.test.ts
npm run typecheck
node scripts/create-release-baseline.mjs --verify
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add -A src/answer-quality.* test/answer-quality.test.* test/typescript-runtime-contract.test.ts state/release-baseline config
git commit -m "refactor(typescript): migrate answer quality without behavior change"
```

---

### Task 5: Type the assistant completion persistence boundary

**Files:**
- Create: `src/assistant-result.ts`
- Create: `test/assistant-result.test.ts`
- Modify: `src/supervisor.mjs` only enough to consume a typed/native-`.ts` helper without changing scheduler behavior
- Modify: `src/worker-process.mjs` only enough to normalize assistant completion through the same helper
- Mirror governed changes under `state/release-baseline/`

**Interfaces:**
- Consumes:
  - `AssistantRespondResult` from `contracts/worker-result.ts`.
- Produces:
  - `normalizeAssistantCompletion(value: unknown): { answer: string } | null`;
  - a single typed validation point for persistence.

- [ ] **Step 1: Write the failing test**

Create `test/assistant-result.test.ts`:

```ts
test("assistant completion requires a non-empty answer", () => {
  assert.deepEqual(
    normalizeAssistantCompletion({ answer: "Hello" }),
    { answer: "Hello" },
  );
  assert.equal(normalizeAssistantCompletion({ summary: "Hello" }), null);
  assert.equal(normalizeAssistantCompletion({ answer: "" }), null);
});
```

Add a type-level invalid fixture proving an assistant completed result cannot omit `answer`.

- [ ] **Step 2: Verify RED**

Run:
```bash
node --test test/assistant-result.test.ts
npm run typecheck
```

Expected: FAIL because `src/assistant-result.ts` does not exist.

- [ ] **Step 3: Implement the minimal typed normalization helper**

The helper accepts `unknown`, rejects arrays/non-objects, and returns only trimmed, non-empty string answers. It stores no provider secrets or prompt content.

- [ ] **Step 4: Replace duplicate ad hoc persistence checks**

In `src/supervisor.mjs`, replace:
```js
typeof message.result?.answer === "string"
```
with the typed helper result.

In `src/worker-process.mjs`, preserve provider execution behavior but ensure successful `assistant.respond` results satisfy the same answer contract before a completion message is emitted.

Do not change routing, zero-credit admission, billing decisions, attempt counts, or provider selection.

- [ ] **Step 5: Run focused behavior and supervisor regressions**

Run:
```bash
node --test test/assistant-result.test.ts test/answer-quality.test.ts test/supervisor-reliability.test.mjs test/zero-credit-answer-routing.test.mjs
npm run typecheck
node scripts/create-release-baseline.mjs --verify
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/assistant-result.ts test/assistant-result.test.ts src/supervisor.mjs src/worker-process.mjs state/release-baseline
git commit -m "refactor(chat): type assistant completion persistence boundary"
```

---

### Task 6: Tranche-wide verification and migration ledger

**Files:**
- Create: `docs/migrations/POLYGLOT-MIGRATION.md`
- Modify: `docs/ECOSYSTEM-LOCK.md` only if verification exposes wording drift
- Modify: `config/language-policy.json` only to reflect the exact remaining migration debt

**Interfaces:**
- Consumes: Tasks 1–5.
- Produces: an auditable migration ledger recording migrated paths, remaining JS/MJS/CJS debt, and explicit exceptions.

- [ ] **Step 1: Write the migration ledger**

Record:
- Tranche 1 migrated paths;
- remaining JS/MJS/CJS counts grouped by `src`, `scripts`, `relay`, and `test`;
- zero JavaScript exceptions unless a real external tool constraint was discovered;
- Python/SQL/C++ not yet introduced because Tranche 1 has no workload that justifies them;
- next dependency cluster recommended for Tranche 2.

The ledger must distinguish “migration debt” from “policy violation.”

- [ ] **Step 2: Run complete local verification**

Run:
```bash
git diff --check
npm run typecheck
npm run language:verify
node scripts/create-release-baseline.mjs --verify
npm run verify
npm --prefix cloud-app run verify
```

Expected: every command exits 0.

- [ ] **Step 3: Confirm exact source/mirror equality for governed migrated files**

Run a deterministic byte comparison between:
- `src/answer-quality.ts` and `state/release-baseline/src/answer-quality.ts`;
- every governed source file changed in the tranche and its mirror.

Expected: byte-identical.

- [ ] **Step 4: Commit verification ledger**

```bash
git add docs/migrations/POLYGLOT-MIGRATION.md config/language-policy.json docs/ECOSYSTEM-LOCK.md
git commit -m "docs(migration): record TypeScript tranche one evidence"
```

- [ ] **Step 5: Push and require exact-head protected verification**

Push the isolated branch and require:
- `Verify (ubuntu-latest)` = success;
- `Verify (windows-latest)` = success.

Do not merge around unavailable runners or failing checks.

- [ ] **Step 6: Production acceptance after merge**

After protected merge:
- confirm canonical Railway deploy references the exact merged SHA;
- verify `/api/live` is 200;
- verify `/api/ready` is 200;
- execute owner-authenticated chat acceptance for `Hello` plus one substantive prompt;
- confirm an assistant answer is persisted and rendered for both;
- confirm zero-credit provider admission remains fail-closed and no paid fallback is introduced.

If any acceptance step fails, keep the previous successful Railway deployment available as rollback target and diagnose the exact layer before further migration.
