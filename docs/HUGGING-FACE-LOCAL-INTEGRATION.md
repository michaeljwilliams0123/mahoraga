# Hugging Face discovery and offline evaluation (bounded integration)

This feature is a read-only development aid. It **does not** add a hosted inference route, auto-install a model, write the model admission ledger, add a runtime capability, perform autonomous agent actions, train weights, approve paid compute, or activate production. GitHub `main` remains source authority; existing `src/model-supply-chain.mjs`, `src/local-reasoner-provider.mjs`, `src/zero-credit-provider-selector.mjs`, and `docs/CREDIT-FREE-AUTONOMY.md` remain unchanged.

## Entry points

On Node 24+ from the repository root:

```sh
node scripts/hugging-face-inspect.ts models "Qwen"
node scripts/hugging-face-inspect.ts papers "agent evaluation"
node scripts/hugging-face-inspect.ts local
node --test --test-isolation=none test/hugging-face-integration.test.ts
```

The model search uses public `GET https://huggingface.co/api/models` with a bounded query, limit, and sorting. Papers use public `GET https://huggingface.co/api/papers/search`. Both reject redirects, use no credentials, enforce a timeout and bounded response body, and emit only selected metadata (no abstracts, executable content, private tokens or downloaded artifacts). Model-search results are never proofs of license approval, content safety, fixed-revision availability, model quality, or runtime admission. Verify these independently. If the upstream paper API changes shape, this feature fails closed.

## Verified admission boundary

`evaluateHuggingFaceAdmission` requires all of the following **simultaneously**:

- Public, non-gated model candidate with a full 40-character immutable Hub SHA;
- exact repository, revision and source artifact SHA-256 present in the existing `admitted` ledger;
- the existing validator accepting the policy, including a safe static inspection receipt within its freshness window;
- the exact Ollama/LM Studio provider, runtime model digest, and loaded size matching the ledger.

No function in this feature issues static-scan receipts, creates runtime bindings, or promotes `quarantined` to `admitted`. A model cannot be admitted using Hub metadata alone. To admit a real model, first independently assess its model card, license, publisher, GGUF/SafeTensors files and external weight provenance; perform a real immutable-revision download and artifact hash/static inspection; validate the resulting receipt and verified runtime digest using the already-governed admission workflow, and follow normal reviewed policy updates and protected gates. Do not invent these receipts.

## Local inference

`local` reuses the existing read-only loopback probes: Ollama at `127.0.0.1:11434` and LM Studio at `127.0.0.1:1234`. In non-development environments the canonical provider rejects the probe. To exercise a permitted **development-only** readiness probe, the environment must have both `NODE_ENV=development` and `ALLOW_LOCAL_AI_DEV=true` and an independently admitted model must be loaded locally. The output intentionally does not expose model names or result text. Readiness is **not** model inference: this feature never calls a generation endpoint, and the existing transient result channel is still required for generation. An unavailable/offline local host remains a hold, not a paid fallback.

## Offline regression benchmarks

Supply a compact JSON file with only **expected output digests** and locally obtained observation digests, no prompts, output bodies or credentials:

```json
{
  "suiteId": "hf-smoke-v1",
  "cases": [
    { "id": "route-task", "expectedSha256": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" }
  ],
  "observations": [
    { "id": "route-task", "status": "completed", "resultSha256": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "durationMs": 25 }
  ]
}
```

Then run `node scripts/hugging-face-inspect.ts benchmark ./fixtures.json`. The summary contains counts, pass rate, lower median response time, and an order-independent SHA-256 fingerprint of canonical inputs. Inputs have strict small-size, case-count, id, hash, and duration limits. This is **repeatable offline scoring**, not verified model execution. The summary always sets `modelExecutionVerified:false`, `promotionEligible:false` and `productionActivated:false`. Any real accuracy, generalization or latency claims require an independently witnessed local-inference run with current runtime/model evidence, source separation, and authenticated receipts; fixtures can be fabricated. Do not wire offline scores directly to model admission or production promotion.

## Cost and operating limits

No Hugging Face Jobs, Endpoints, Inference Providers, paid tokens, or GPU sessions are invoked. Public API metadata reads are best-effort and not a guarantee of continued availability. Local inference may consume the owner's machine resources; this integration does not start local servers. No licensing, identity, safety, payment or sovereignty boundaries are changed.

## Verification

The PR requires exact-head Ubuntu and Windows Verify checks under the existing protected-main policy, including `npm run verify`. Do not represent a passing unit test as proof of live Hugging Face API reachability, local GPU inference, production Cloudflare convergence, or application-level execution. After merging, revalidate the merged SHA before claiming activation.
