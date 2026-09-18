# Mahoraga Polyglot Runtime Architecture — Design

**Status:** Owner-approved direction; implementation requires this written-spec review gate  
**Date:** 2026-09-17  
**Base:** GitHub `main` at `0a863a14e2f7f3ea784ef794d7b2d1546ea1970c`  
**Scope:** Language architecture, typed control plane, cross-language execution contracts, migration sequencing, verification and rollback

## 1. Objective

Mahoraga will become a deliberately polyglot system rather than a JavaScript-centric repository.

TypeScript is the canonical application and control-plane language because Mahoraga's highest-risk code is contract-heavy: task states, worker states, authority decisions, provider admission, billing evidence, receipts, conversation messages, release provenance, and owner controls. Other languages are first-class only where they provide a concrete platform, ecosystem, or performance advantage.

The migration is not a rewrite and does not create a parallel product. It preserves the existing Mahoraga repository, runtime model, canonical Railway host, security boundaries, protected-main verification, release-baseline rule, owner sovereignty, zero-credit policy, rollback model, and current UI architecture.

## 2. Superseded language constraint

The existing ecosystem lock intentionally keeps `src/`, `scripts/`, `test/`, and `relay/` on Node ESM `.mjs`. The owner has now explicitly started the permitted migration described by that lock.

The implementation will therefore replace only the language restriction while preserving the surrounding ecosystem lock. No migration PR may use the language change to weaken authentication, authority, network aperture rules, exact-head verification, rollback, immutable evidence, or source/deployment/runtime truth separation.

## 3. Language allocation

### TypeScript

Default language for:

- `src/` runtime, supervisor, router, workers, authority, receipts, persistence orchestration, evolution and repair logic;
- `scripts/` deterministic automation and release tooling;
- `relay/` protocol and transport logic;
- `test/` behavior and contract tests;
- `cloud-app/` and `operator-deck/` UI/control-library code;
- shared protocol and runtime interfaces.

The control plane will run TypeScript directly on Node 24 using erasable TypeScript syntax and will be type-checked separately with `tsc --noEmit`. Runtime code must not depend on TypeScript features that require JavaScript generation.

### TSX + semantic HTML + CSS

The one deployable browser surface remains `cloud-app/`. UI continues to use TSX with semantic HTML and CSS. Standalone HTML is allowed for static reports, test fixtures, protocol artifacts, or generated documentation, but not for a second Mahoraga frontend.

### SQL

SQL becomes the canonical language for relational schema, migrations, durable queries, and database invariants that are better expressed relationally than procedurally.

A future `sql/` tree may contain:

- versioned SQLite migrations;
- schema assertions;
- indexes and constraints;
- deterministic analytical queries.

TypeScript remains responsible for migration orchestration, transaction boundaries, parameter binding, and receipt generation.

### Python

Python is reserved for workloads where its ecosystem materially outperforms TypeScript, including:

- data analysis;
- evaluation harnesses;
- numerical experiments;
- ML/model-quality experiments;
- offline research transforms;
- batch artifact analysis.

Python does not own Mahoraga's authority model or primary scheduler. Python workers communicate through bounded JSON contracts or database/file artifacts and cannot receive arbitrary executable strings from callers.

### C++

C++ is permitted only for benchmark-proven hot paths where native execution materially improves latency, throughput, memory use, or access to a native library.

The default integration is Node-API, not direct V8 internals, so native modules remain ABI-stable across supported Node versions. A C++ tranche must include cross-platform Linux/Windows builds, deterministic tests, a TypeScript fallback or fail-closed path when practical, and measured evidence justifying the native complexity.

C++ is not introduced merely to increase language diversity.

### PowerShell and Bash

PowerShell is preferred for Windows-native bootstrap, service, scheduled-task, driver, registry, and recovery operations. Bash is preferred for Linux-native bootstrap, packaging, and host operations.

OS scripts remain bounded adapters. Core authority, routing, and policy logic stays in TypeScript.

### Other languages

Rust, Go, WebAssembly, or another language may be introduced only when a specific subsystem has a measurable reason. Every new language requires the same contract, verification, packaging, rollback, and security rules defined here.

## 4. Canonical cross-language contract

Polyglot components do not call each other through unstructured stdout text or undocumented object shapes.

Every cross-language execution uses a versioned envelope with at least:

- `schemaVersion`;
- `correlationId`;
- `taskId`;
- `capability`;
- `authorityDecisionId` or authority evidence reference;
- declared input/output classification;
- bounded payload reference or payload;
- result status;
- receipt/evidence;
- error/reason code when non-successful.

The canonical result union is conceptually:

```ts
type WorkerResult =
  | { status: "completed"; receipt: CapabilityReceipt; output: unknown }
  | { status: "waiting"; reasonCode: WaitingReason }
  | { status: "failed"; errorCode: WorkerErrorCode };
```

Capability-specific contracts refine `output`. For example, an `assistant.respond` success requires an `answer: string`; code that reports success without an answer must fail type checking or runtime validation before persistence.

## 5. Contract source of truth

Cross-language wire contracts will be represented in a language-neutral schema form under `contracts/`.

The implementation plan will choose the lightest deterministic toolchain that can:

1. validate payloads at runtime;
2. provide strict TypeScript types;
3. allow Python/native workers to validate the same schema;
4. avoid duplicate hand-maintained definitions where possible;
5. run fully offline after dependencies are installed.

Generated artifacts must be reproducible and verified in CI. Secrets and private content are never embedded in generated schemas or fixtures.

## 6. TypeScript runtime strategy

Root control-plane TypeScript will target Node 24's native TypeScript execution.

Required compiler posture:

- `strict: true`;
- `noEmit: true`;
- `module: "nodenext"`;
- `target: "esnext"`;
- `erasableSyntaxOnly: true`;
- `verbatimModuleSyntax: true`;
- `noUncheckedIndexedAccess: true`;
- `exactOptionalPropertyTypes: true`.

Runtime modules will use explicit file extensions and `import type` for type-only imports. The project will not rely on tsconfig path aliases in code executed directly by Node.

The minimum supported Node version will be raised to a release where native type stripping is stable. Railway and both protected self-hosted verification planes must prove that version before the first control-plane TypeScript file is merged.

## 7. Migration model

This is a strangler migration, not a mass rename.

### Phase 0 — governance and toolchain

- update the ecosystem lock and agent instructions to describe the polyglot policy;
- add root TypeScript tooling and strict configuration;
- add language-policy verification;
- teach release-baseline tooling to understand governed `.ts` paths;
- prove Node/CI/Railway TypeScript execution without changing behavior.

### Phase 1 — shared contracts and one vertical slice

Migrate one complete, low-blast-radius production path from intake through tests. The preferred first slice is answer-quality / assistant-result contracts because the current chat work already exposed the cost of untyped result shapes.

Acceptance requires identical behavior before and after the migration plus explicit compile-time coverage for invalid result shapes.

### Phase 2 — runtime core

Incrementally migrate:

- router;
- task policy;
- receipt registry;
- database types/interfaces;
- supervisor;
- runtime/server;
- worker process;
- core worker families.

Each PR moves a coherent dependency cluster and its tests together. Temporary `.mjs` compatibility shims are allowed only when needed to keep `main` deployable and are removed once their dependency cluster has migrated.

### Phase 3 — scripts, relay and tests

Migrate deterministic scripts, relay code, and test suites to TypeScript. Update package scripts and CI to execute `.ts` directly and type-check before behavior tests.

### Phase 4 — SQL extraction

Move relational schema/migrations/invariants that are currently embedded in procedural code into versioned SQL where that improves auditability and correctness.

### Phase 5 — Python specialization

Introduce Python only for a concrete evaluator, analysis, or ML/data workload. Add a bounded runner, schema validation, dependency lock, tests, and CI at the same time as the first real Python workload.

### Phase 6 — native specialization

Introduce C++ only after profiling identifies a hot path and a benchmark demonstrates material benefit. No speculative native addon is part of the initial migration.

### Phase 7 — JavaScript elimination

Remove remaining application/test `.js`, `.mjs`, and `.cjs` files unless an external tool genuinely requires that format. Every retained JavaScript exception must be documented with the tool constraint and owner.

## 8. Repository boundaries

Proposed target layout:

```text
contracts/             language-neutral wire contracts
src/                   TypeScript control plane
scripts/               TypeScript deterministic tooling
relay/                 TypeScript protocol/transport
test/                  TypeScript tests
cloud-app/             TypeScript/TSX + HTML/CSS UI
operator-deck/         TypeScript reference/control library
sql/                   schema, migrations, relational invariants
python/                specialized analysis/eval workers
native/                benchmark-justified C++/native modules
ops/windows/            PowerShell
ops/linux/              Bash
state/release-baseline/ exact governed mirrors
```

Directories are introduced only when their first real workload exists. Empty framework scaffolding is prohibited.

## 9. Security and authority invariants

The language migration may not change these invariants:

- GitHub `main` remains source authority.
- Railway remains the canonical cloud runtime.
- Owner authentication and four-digit PIN UX remain separate from high-entropy server-side authority secrets.
- Provider admission remains fail-closed.
- Zero-credit work never silently falls through to a paid or licensed provider.
- Raw 4782/4783 listeners are never directly exposed publicly.
- Worker capability and path scopes remain bounded.
- No language worker receives arbitrary caller-selected command lines or executable paths.
- Private content and credentials remain outside commits and diagnostics.
- Exact-head Windows and Ubuntu Verify remain mandatory.
- Candidate code cannot use its own modified evolution/security policy to approve itself.
- Release-baseline source/mirror pairs move together.

## 10. Verification gates

Every migration PR must run, as applicable:

1. TypeScript typecheck for migrated TypeScript trees.
2. Focused behavior tests.
3. Language-specific checks:
   - Python: type/static checks plus tests;
   - C++: build plus native tests on Linux and Windows;
   - PowerShell: static analysis/tests when changed;
   - Bash: shell lint/tests when changed;
   - SQL: migration/schema verification.
4. `git diff --check`.
5. release-baseline verification for governed files.
6. full `npm run verify`.
7. exact-head protected `Verify (ubuntu-latest)`.
8. exact-head protected `Verify (windows-latest)`.

A migration PR is not complete merely because it compiles.

## 11. Deployment and rollback

The migration proceeds in deployable slices. No PR may leave `main` requiring a future PR in order to boot.

For each production-affecting slice:

1. merge only after exact-head verification;
2. confirm Railway deploys the exact merged SHA;
3. confirm `/api/live` and `/api/ready`;
4. execute a capability-specific acceptance transaction;
5. retain the previous successful Railway deployment as rollback target until acceptance passes.

Windows 7 activation remains outside this migration unless separately approved through the release/evolution channel.

## 12. Interaction with current chat fix

PR #584 remains an independent bug-fix lane. The polyglot migration must not absorb, duplicate, or bypass its behavior change. The first migration tranche rebases on the then-current `main` and preserves the accepted greeting behavior if #584 merges first.

## 13. Success criteria

The migration succeeds when:

- TypeScript owns the runtime/control-plane contract surface;
- no ordinary application/test JavaScript remains without a documented external constraint;
- every non-TypeScript worker crosses a validated, versioned contract boundary;
- SQL owns relational logic where appropriate;
- Python is used for workloads that benefit from its analytical ecosystem rather than as a second scheduler;
- C++ exists only where benchmarks justify it;
- browser UI remains one TypeScript/TSX application;
- protected verification, security, authority, zero-credit, rollback, and Railway provenance remain intact;
- live acceptance behavior is at least as reliable as the pre-migration baseline.

## 14. Explicit non-goals

This design does not:

- rewrite Mahoraga from scratch;
- create a second UI;
- move the scheduler to Python or C++;
- introduce native code without measured need;
- weaken verification to make migration easier;
- activate Windows 7;
- introduce paid-provider fallback;
- change owner-sovereignty boundaries;
- require every supported language to appear immediately.

The governing rule is: **use TypeScript by default; use another language only when it is demonstrably the better tool for that subsystem, and make every boundary typed, bounded, testable, and reversible.**
