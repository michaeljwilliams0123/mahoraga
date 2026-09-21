# Mahoraga Edge Convergence Foundation Design

## Source and intent

This design is a repository-ready derivative of the owner-supplied `mahoraga-architectural-fixes.md` for Mahoraga 7.0.0-alpha.2. It preserves the source document's central requirement: a **Capability-First Separation of Evidence Domains** so **Source Truth** (protected GitHub `main`), **Deployment Truth** (edge/CDN deployment evidence), and **Live-Runtime Truth** (fresh worker/runtime status) remain distinct and fail closed.

The source document also defines the long-range architecture: universal TypeScript schemas, a mutation engine, a verification pipeline, a unified cognitive plane, a State-Mirroring Asymmetric Mesh Grid, and GitHub Actions/Cloudflare execution. This design starts only the foundation needed to make later tranches safe and independently executable.

## Current repository constraints

- Mahoraga remains the product name; `7.0.0-alpha.2` is build/provenance metadata.
- `main` remains protected by exact-head `Verify (ubuntu-latest)` and `Verify (windows-latest)` contexts.
- Public repository visibility does not expand merge, deploy, credential, runtime, or owner authority.
- GitHub Actions remain least-privilege, GitHub-owned only, and full-SHA pinned.
- No Windows activation of 7.0.0-alpha.2 is introduced by this tranche.
- No new provider, paid fallback, tunnel, deployment target, or browser-held privileged credential is introduced.

## Decomposition

The attached architecture spans several independent subsystems, so implementation is split into separate tranches.

### Tranche A — Foundation contracts, verification, portable CI

Implement the shared TypeScript contracts and verification primitive first. Move deterministic verification off device-bound self-hosted runners onto GitHub-hosted public-repository runners while preserving the existing required check names. This is the tranche covered by the companion implementation plan.

### Tranche B — Controlled adaptation engine

Implement `EvolutionaryOptimizer` only after the type and verification contracts are stable. The source document's string/regex mutation approach is treated as a design input, not permission to hot-swap production code. Production mutation authority remains behind existing review, exact-head verification, and promotion boundaries.

### Tranche C — Unified cognitive plane

Implement the `UnifiedCognitivePlane` against the stable contracts and verifier, without expanding authority. State transitions and checkpoint promotion must remain receipted and evidence-bound.

### Tranche D — Edge workspace mesh

Implement `StateMirrorMesh` inside the existing `cloud-app/` workspace so degraded network state isolates UI routing instead of causing redirect or retry loops. It must not become an authority plane.

### Tranche E — Edge deployment convergence

Only after prior tranches are proven, integrate Cloudflare edge deployment/promotion with explicit Source Truth, Deployment Truth, and Live-Runtime Truth receipts. Deployment secrets stay server-side; public source remains separate from runtime authority.

## Portable execution model

The owner explicitly wants another job to be able to run independently from anywhere. The foundation therefore separates two classes of execution:

1. **Unprivileged verification and build work** runs on GitHub-hosted `ubuntu-latest` / `windows-latest` runners. It requires no owner PC to be online and uses no deployment secrets.
2. **Privileged mutation/deployment work** remains separately owner-bound and may use existing protected gateways or deployment credentials. Public CI never receives authority merely because it can run anywhere.

The two existing required check names stay unchanged, preventing branch-protection drift while removing the availability dependency on local/self-hosted machines.

## Foundation interfaces

### `src/types/mahoraga.ts`

Defines the source specification's canonical contracts:

- `AdaptationTier`
- `ErrorProfileCode`
- `DefendedPhenomenon`
- `ExecutionEnvironment`
- `AuthorityDecisionEnvelope`
- `CognitiveStateSchema`
- `BrandedASTNode`
- `MutationDirective`
- `CanaryProbeReport`

The contracts remain environment-neutral and contain no secrets or browser authority.

### `src/core/VerificationPipeline.ts`

Implements the source specification's bounded pre-rollback canary behavior:

- structural candidate check
- bounded CPU delta measurement
- SHA-256 candidate signature
- fail-closed exception when the allocated CPU threshold is exceeded

This tranche does not compile or execute arbitrary generated source and does not perform production hot-swaps.

## Security boundaries

- Browser state is presentation state, not execution authority.
- Repository visibility is not runtime authority.
- GitHub-hosted verification receives `contents: read` only.
- No secret is needed for the portable CI verification jobs.
- Deployment and mutation remain separate from verification.
- Full commit SHA pinning remains blocking.
- Exact-head required checks remain the merge gate.

## Success criteria

1. The shared TypeScript contracts typecheck under the repository's strict `nodenext`, `noUncheckedIndexedAccess`, and `exactOptionalPropertyTypes` configuration.
2. The verifier produces deterministic SHA-256 evidence and fails closed when its CPU budget is exceeded.
3. `Verify (ubuntu-latest)` and `Verify (windows-latest)` run without any self-hosted runner dependency while preserving their exact context names.
4. Verification jobs remain read-only and secret-free.
5. No deployment, mutation, provider, browser-authority, or Windows activation behavior changes in this tranche.
6. Later architecture tranches can depend on the new contracts without importing edge/UI or deployment-specific state.
