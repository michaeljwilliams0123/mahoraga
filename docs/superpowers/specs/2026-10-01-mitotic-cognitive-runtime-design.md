# Mitotic cognitive runtime

Owner goal: add the absent capabilities in the supplied JS/TS AI blueprint and improve existing equivalents within Mahoraga.

## Current capability map

| Blueprint | Current source | Change |
| --- | --- | --- |
| Generative responses / SDK | `src/native-cloud-model.mjs`, `cloud-app/package.json` | Add reusable strict structured-output validation and admitted loopback structured generation. |
| Stateful agent graph | `src/cognitive-loop.mjs`, `src/cognitive-investigation.ts`, `src/workspace-dispatch-fabric.mjs` | Reuse the existing graph rather than install a competing orchestrator. |
| Predictive learning | `src/prediction-calibration.mjs`, `src/prediction-backtest.mjs` | Score clone predictions against observed outcomes with the existing calibration contract. |
| Embeddings / semantic search | Institutional memory currently filters metadata | Add admitted loopback embedding extraction and a bounded, model-bound, in-memory cosine index returning content references. |
| Agent cloning | Twin descriptors and Cloudflare lifecycle evaluation exist | Add actual Node worker-thread execution of cloned cognitive state, bounded alternatives, lineage, cancellation and cleanup. |
| Recombination | Verified cognitive learning exists | Return candidates to incumbent verification; promote only verified measured outcomes, retaining parent state unchanged. |

## Design

New runtime code is TypeScript. A fixed worker entry executes the existing cognitive loop on structured-cloned input. It accepts alternate proposed actions only; credentials, authority, provider configuration and executable paths are never mutation targets. All children finish or are terminated before the call settles. Thread isolation is a memory boundary, not an OS security sandbox. No recursive cloning or generated worker code is supported.

Structured outputs use an explicit bounded JSON Schema subset (object, array, primitive types, required/properties, enum and numeric/length bounds). Unsupported keywords fail closed. Model output never executes tools or code. The existing evolution payload validator additionally enforces the configured schema.

Local structured generation and embeddings use fixed Ollama loopback endpoints with fresh existing artifact admission and an open transient result channel. Responses are byte bounded; raw text/vectors stay in caller memory; transient receipts contain digests only. No runtime model is admitted or enabled by this change. Semantic search requires identical model digest and vector dimensions; it returns references and similarity, never authority or asserted facts.

Prediction evaluation happens after clone execution against observed state and independent verification bound to exact result fingerprints. No random success rates, no automatic parent policy mutation, no AGI claim. Source implementation and tests cannot prove a real admitted-model transaction or live deployment.

## Acceptance

Tests exercise real worker threads, parent immutability, bounded alternatives, malformed input, cancellation, timeout/exit cleanup, observed-outcome promotion, schema constraints, mixed embedding spaces and unadmitted/remote models. Existing cognitive and evolution regressions remain green. Windows production remains `3.6.0`. Required PR checks run on the exact head.
