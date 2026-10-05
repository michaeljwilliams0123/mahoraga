# Live UI evolution backlog — 2026-10-05

## Purpose and decision rule

This is a bounded, evidence-first backlog from an authenticated Cloudflare
workspace exercise. It is not an activation plan and it grants no new runtime,
repository, cloud, or spending authority. Each item must be implemented in an
isolated PR with focused tests, exact-head protected CI, and (where applicable)
exact-SHA Cloudflare acceptance.

The authority order remains: protected GitHub `main` source, exact deployment,
live runtime/provider evidence, explicit authority decision, then verification
receipt. A green UI shell or a model answer is not transaction authority.

## Observations this backlog is based on

| Observation | Evidence | Consequence |
| --- | --- | --- |
| Authenticated owner browser connected to the native Cloudflare runtime. | UI showed **Brain connected**; generative, agentic, and predictive routes were routable. | A real browser test lane exists, but it must remain owner-authenticated. |
| TypeScript generation returned a typed implementation and code fence without claiming execution. | Live `groupByKey<T, K>` request. | Code generation is usable as a response capability only. |
| A staged `.ts` file was appended to the chat request as bounded text. | Upload marker and source contents appeared in the visible user turn. | Text snippets are model-visible; binary artifacts are not thereby model-readable. |
| Numbered code in that snippet triggered `cognition provider response incomplete`. | The runtime treated source-test numbering as prompt scenarios. | Regression repair is tracked in PR #986; do not declare uploads fully complete until that exact head is accepted and retested. |
| Initial exact-main acceptance encountered a 412, then the one bounded same-SHA retry passed. | Exact acceptance receipts for `e48b4ec…`. | Deployment/DO convergence diagnostics need a stronger, receipt-preserving retry story. |

## Priority 0 — preserve proven boundaries

These are safeguards, not optional features.

1. **Retest the snippet-completeness repair after acceptance.**
   - Scope: PR #986 only; upload a numbered TypeScript fixture and request a
     prose review.
   - Pass condition: Mahoraga returns a normal response; it does not emit a
     false incomplete-response error.
   - Must preserve: genuine numbered multi-scenario prompts still fail closed
     when the answer omits required sections.

2. **Make acceptance 412 evidence diagnosable without weakening it.**
   - Scope: sanitize expected/actual SHA and route layer in the receipt when an
     acceptance execute probe is rejected.
   - Pass condition: a failure identifies whether it came from outer Worker,
     Durable Object, gateway, or stale request; no secret/header values appear.
   - Do not: retry indefinitely, accept a stale SHA, or replace exact acceptance
     with a health badge.

3. **Keep native GitHub mutations receipt-gated.**
   - Scope: run one attended draft-PR canary after the UI path is stable.
   - Pass condition: the receipt names the exact base/head, PR number, and
     proves no direct-main write occurred unless an explicit direct-main action
     was separately authorized.
   - Do not: restore Composio ownership, browser-stored GitHub credentials, or
     a generic repository shell.

## Priority 1 — complete the conversation and upload contract

1. **Expose snippet handling truth in the UI.**
   - Show whether an attachment was appended as text, retained as an opaque
     artifact, rejected for size/type, or excluded from model context.
   - Include per-file and aggregate byte limits before send.
   - Acceptance: an owner can distinguish a staged file from a model-visible
     snippet without inspecting request payloads.

2. **Add a bounded binary/document ingestion lane.**
   - Candidate architecture: keep binary content in the existing artifact
     boundary; extract only allow-listed, size-bounded text through a Worker
     handler, with content type, hash, source, retention, and extraction receipt.
   - Candidate storage: R2 only if the artifact boundary requires durable object
     storage beyond the current bridge; do not introduce it merely for a UI badge.
   - Acceptance: a PDF/image/binary either produces a verified, bounded text
     extraction receipt or is explicitly unavailable. Never silently pretend it
     was read.

3. **Add prompt-context provenance.**
   - Render a compact receipt listing user text, appended text-snippet names and
     byte counts, excluded files, model route, and response completeness result.
   - Exclude raw private content and credentials from the receipt.

4. **Harden scenario-completeness parsing.**
   - Support only explicit user scenario grammar and preserve the snippet
     exclusion rule.
   - Add adversarial tests for markdown lists, code blocks, quoted material,
     generated code, and malformed upload delimiters.

## Priority 2 — make generated code more useful without granting execution

1. **Generated-code contract.**
   - Require language label, assumptions, dependency list, run instructions,
     and explicit status: `generated`, never `executed` without a receipt.
   - Acceptance: TypeScript, JavaScript, C++, HTML/CSS, Python, SQL, and shell
     examples render correctly and downloads retain the indicated extension.

2. **Optional static validation lane.**
   - Validate generated code only in isolated, language-specific deterministic
     checks; return diagnostics and a receipt.
   - No arbitrary caller-selected command, package install, network egress, or
     repository write. If actual execution is later needed, evaluate the existing
     Sandbox/Dynamic Worker boundary in a separately approved design.

3. **Patch-to-PR handoff.**
   - Let an owner review a generated patch, then create a draft branch/PR via
     the native GitHub App.
   - Require explicit file allow-list, diff preview, tests selected by policy,
     exact base SHA, and a typed GitHub receipt. Never infer merge approval from
     generated prose.

## Priority 3 — improve cognitive evidence, not labels

1. **Predictive calibration workbench.**
   - Capture predictions, confidence, outcome window, and scoring receipt;
     evaluate only against held-out outcomes.
   - Report calibration and error measures, not an unsupported intelligence tier.

2. **Agentic plan-to-receipt loop.**
   - Continue to make `cognitive.cycle` plan and emit a receipt only.
   - Add an owner-reviewed transition from proposed action to a bounded,
     policy-selected tool request, with idempotency and stop control.

3. **Collective/deliberative capability evaluation.**
   - Treat `cognitive.deliberate` as unavailable until comparative held-out
     receipts demonstrate an advantage over the single-route baseline.
   - Do not claim AGI or "super-general" capability from route presence,
     generated prose, or scenario performance.

## Priority 4 — UI reliability and operator experience

1. **Authentication state clarity.**
   - Replace prolonged `Connecting` with a bounded state machine: authenticated,
     connecting, Access required, recovery available, and unavailable.
   - Acceptance: unauthenticated users see an actionable Cloudflare Access path;
     no background fallback obtains authority.

2. **Browser acceptance suite.**
   - Automate owner-session checks for connection, code generation, text upload,
     scenario completeness, native GitHub probe, and failure rendering.
   - Run only in a protected, secret-safe environment; persist sanitized results.

3. **Accessibility and recovery.**
   - Verify keyboard upload/remove, visible error announcement, disabled-control
     explanation, and reconnect after a transient provider interruption.

## Sequencing and stop conditions

1. Land and accept the P0 snippet regression repair, then execute its browser
   retest.
2. Add acceptance diagnostics before changing retry behavior.
3. Finish text/binary context truth before adding more model-facing upload types.
4. Add generated-code validation and GitHub draft-PR handoff only as distinct,
   reviewable lanes.

Stop and request direction for any credential change, widened Cloudflare Access
policy, paid-provider option, direct-main mutation, destructive action, or
irreversible repository governance change. Keep Railway legacy-only:
zero-route, zero-influence, zero-fallback, zero-authority.

## Candidate acceptance matrix

| Area | Required evidence before calling it complete |
| --- | --- |
| Text snippet | Authenticated browser request visibly contains bounded text; runtime response succeeds; exact-head CI and Cloudflare acceptance pass. |
| Binary extraction | Type/size/hash/extraction receipt; explicit unavailable result for unsupported content; no hidden model-context claim. |
| Generated code | Language-labelled output plus static-validation receipt if validation is requested; no execution claim without an execution receipt. |
| GitHub mutation | Native App receipt, exact base/head, protected PR checks, and explicit merge/direct-main authority. |
| Prediction/agent loop | Held-out or postcondition evidence, idempotency, stop control, and outcome receipt. |
| Cloudflare release | Protected `main`, exact SHA, provider admission, Access, readiness, and retained acceptance receipt. |
