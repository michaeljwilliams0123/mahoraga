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

`inspectHuggingFaceRevision(repoId, revision)` is a read-only preflight for a
specific public Hub repository and full 40-character revision SHA. It uses the
Hub revision metadata endpoint with no credentials, redirects, artifact
downloads, or hosted inference, and rejects a response unless its repository
and returned revision match the request exactly. Its result deliberately says
`artifactVerified:false` and `requires-independent-inspection`: this only
establishes that the Hub currently reports the named immutable revision; it
does not verify weights, a license, a model card, an admission record, or live
execution.

`inspectHuggingFaceArtifactMetadata(repoId, revision, artifactPath)` adds one
more read-only preflight for an already pinned public revision. It queries the
Hub tree metadata and accepts only one safe `.safetensors` or `.gguf` file with
a matching positive byte count and a 64-character Hub LFS object ID. It does
not download the file or locally recompute that hash: its result intentionally
keeps `artifactVerified:false`, `artifactDownloaded:false`, and
`requires-independent-inspection`. The descriptor is useful input to a later
independent download, hash, static scan, runtime binding, and admission review;
it cannot replace any of those steps.

`evaluateHuggingFaceAdmission` requires all of the following **simultaneously**:

- Public, non-gated model candidate with a full 40-character immutable Hub SHA;
- exact repository, revision and source artifact SHA-256 present in the existing `admitted` ledger;
- the existing validator accepting the policy, including a safe static inspection receipt within its freshness window;
- the exact Ollama/LM Studio provider, runtime model digest, and loaded size matching **the same admitted ledger record** as the verified source artifact (never a different admitted model).

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

Then run `node scripts/hugging-face-inspect.ts benchmark ./fixtures.json`. The summary contains pass/failure/mismatch counts, pass and failure rates, lower median and p95 observed duration, and an order-independent SHA-256 fingerprint of canonical inputs. Only exact declared JSON fields are accepted at the suite, case, and observation levels: injected prompts, responses, notes, or other undeclared content are rejected. Inputs have strict small-size, case-count, id, hash, and duration limits. This is **repeatable offline scoring**, not verified model execution. The summary always sets `modelExecutionVerified:false`, `promotionEligible:false` and `productionActivated:false`. Any real accuracy, generalization or latency claims require an independently witnessed local-inference run with current runtime/model evidence, source separation, and authenticated receipts; fixtures can be fabricated. Do not wire offline scores directly to model admission or production promotion.

## Cost and operating limits

No Hugging Face Jobs, Endpoints, Inference Providers, paid tokens, or GPU sessions are invoked. Public API metadata reads are best-effort and not a guarantee of continued availability. Local inference may consume the owner's machine resources; this integration does not start local servers. No licensing, identity, safety, payment or sovereignty boundaries are changed.

## Verification

The PR requires exact-head Ubuntu and Windows Verify checks under the existing protected-main policy, including `npm run verify`. Do not represent a passing unit test as proof of live Hugging Face API reachability, local GPU inference, production Cloudflare convergence, or application-level execution. After merging, revalidate the merged SHA before claiming activation.


## Native Learning v2 — one integrated workflow

This extension uses the existing Cloudflare Durable Object and existing five-minute
Cron, the canonical Hugging Face supply-chain policy, local Ollama inference,
transient result channels and existing semantic-memory index. No new bot, recurring
GitHub workflow, HF token, hosted inference provider, or paid GPU is required.

**Cloud-only native discovery:** while the owner has enabled internal activity,
the Cloudflare runtime performs at most one bounded public model metadata
request every 24 hours, rotating through SmolLM, Qwen and MiniLM research topics. After a failure it holds for six hours. The Durable Object
stores only validated public repo IDs, 40-character Hub revision IDs, claimed
licenses, download counts, exact source SHA and timestamps. It does **not** download, scan,
execute, admit, or deploy a candidate. The existing native activity projection
exposes this metadata in the Control Center. Owner pause halts the probe. Failure
cannot trigger a paid fallback.

**Local operator workflow:**

```powershell
npm run hf:study -- SmolLM
npm run hf:status
npm run hf:trial -- .\local-benchmark.json
npm run hf:recall -- .\local-recall.json
npm run hf:compare
```

The study command verifies public exact Hub revisions where available, but a
revision and license claim are **not** sufficient for production admission.
A candidate must independently pass pinned artifact download, hash/static scan,
license review, fresh inspection receipt, and exact Ollama runtime digest in the
**existing** `config/model-supply-chain.json` policy before local execution.
There is no automatic installation, model download, credential expansion,
production route, or permission to update this policy via benchmark scores.

Trial input is small and deliberately local (1–8 cases; 32 KiB total prompts):

```json
{
  "suiteId": "hf-trial-v1",
  "cases": [
    {
      "id": "basic",
      "prompt": "Return a JSON object with summary set to right",
      "schema": {
        "type": "object",
        "additionalProperties": false,
        "required": ["summary"],
        "properties": { "summary": { "type": "string", "maxLength": 100 } }
      },
      "expectedSha256": "<SHA256 of JSON.stringify({summary:'right'})>"
    }
  ]
}
```

Compute `expectedSha256` from a reviewed canonical JSON result, not from a
guess or the model's prediction. The trial calls the **existing locally
admitted** Ollama generation adapter, compares actual response hashes, records
bounded latencies and the exact admitted runtime model digest, and never stores
prompts or generated text. Failed/unadmitted runs remain failures rather than
fabricated successes.

Recall input:

```json
{
  "documents": [
    { "reference": "issue:786", "text": "Private text stays transient in memory" }
  ],
  "query": "relevant incident",
  "limit": 5
}
```

Recall uses the same admission boundary and local Ollama embed route; it
returns only references, similarity scores, hashes and model digest, never raw
document contents. Do not submit confidential data to public Hub discovery.

`hf:compare` requires at least two completed live-local runs of the same
fingerprinted suite. Its selection is **recommendation for inspection only**,
not evaluation independence, promotion, route change or production proof.
Results are saved as compact metadata in `~/.mahoraga/hf-native-learning.json`,
outside the repository, with atomic writes and a bounded 32-receipt history.
The ledger is an operator's local evidence cache, not a signed authority.

### Acceptance and limitations

- CI must pass on both Ubuntu and Windows at the exact PR SHA.
- Cloudflare deployment must pass exact-main canonical acceptance after merge;
  a successful workflow is not proof of real local inference or an HF API response.
- Cloudflare scans can run with your PC powered off; local Ollama trial/recall
  require the machine online and an independently admitted model installed.
- No inference takes place in Cloudflare via Hugging Face. Cloudflare Workers
  free-plan quotas and network allowances must still be respected; metadata
  requests are rate-bounded and disabled by owner pause.
- Policy/grants retain their normal GitHub governance. Existing owner admin/edit
  rights are not expanded, and benchmark results never mint new rights.
