# Mitotic Cognitive Runtime Implementation Plan

> Execution: native implementation in this session under the owner's standing authorization.

**Goal:** Add real cognitive state cloning, typed model outputs and semantic retrieval to existing Mahoraga flows.

**Architecture:** Fixed TypeScript worker clones execute the existing cognitive loop. An admitted loopback inference adapter supplies schema-validated objects and model-bound vectors; incumbent verification remains responsible for promotion.

**Tech Stack:** TypeScript, Node 24 worker threads, existing prediction and model admission contracts.

**Spec:** `docs/superpowers/specs/2026-10-01-mitotic-cognitive-runtime-design.md`

## Global constraints

- Windows production remains `3.6.0`.
- No competing agent framework, paid fallback, default provider activation, generated executable or credential copying.
- Raw model content stays transient; ledger receipts contain digests only.
- Governed source mirrors remain exact.

## Review focus

- Reject unsupported schemas rather than silently ignore constraints.
- Separate different embedding models/dimensions and reject nonfinite/zero vectors.
- Terminate siblings on failure, cancellation and deadline.
- Reject mismatched verification and preserve parent state and dissent.
- Revalidate model admission and bound responses at the execution boundary.

### Task 1: Structured output and semantic inference

Files: `src/structured-output.ts`, `src/semantic-memory.ts`, `src/local-ai-inference.ts`, focused TypeScript tests, existing evolution validator and its baseline mirror.

- [ ] Write and run failing tests for strict nested output validation, bounded model responses and vector space separation.
- [ ] Implement `validateStructuredOutput`, `parseStructuredOutput`, `createSemanticIndex`, `generateLocalStructuredOutput`, and `generateLocalEmbeddings`.
- [ ] Enforce the external schema inside `validateEvolutionPayload` and run existing evolution regressions.

### Task 2: Cloned cognitive execution and verified recombination

Files: `src/cognitive-mitosis.ts`, `src/cognitive-clone-worker.ts`, `src/cognitive-worker.mjs`, governed mirrors and focused tests.

- [ ] Write and run failing tests for real workers, unchanged parent state, measured outcome promotion and failure cleanup.
- [ ] Implement `runCognitiveMitosis` with bounded alternatives and `evaluateCognitiveClones` with incumbent verification.
- [ ] Mount optional mitosis on existing `cognitive.cycle`; do not add execution authority.
- [ ] Run focused cognitive/prediction regressions.

### Task 3: Integration

- [ ] Document invocation and evidence limits.
- [ ] Verify baseline bytes, typechecks, diff formatting and full repository verification.
- [ ] Push isolated branch, open PR, require exact-head Ubuntu and Windows gates.
