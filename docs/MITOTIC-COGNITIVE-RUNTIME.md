# Cognitive cloning and local AI

Mahoraga's existing cognitive core can evaluate alternative forecasts in separate Node worker threads. Twin federation and the disposable Cloudflare lifecycle experiment remain separate capabilities; worker-thread clones share the incumbent source code and have their own copied cognitive state.

## Runtime task interface

Use the existing `cognitive.cycle` capability through the authenticated task boundary. Its `capabilityInput` accepts the ordinary `cognitiveInput` plus:

```json
{
  "mitosis": {
    "candidates": [
      {
        "id": "alternate-forecast",
        "action": {
          "actionId": "alternate-forecast",
          "effects": { "queueDepth": -2 },
          "uncertainty": 0.1
        }
      }
    ],
    "limits": { "maximumClones": 4, "maximumParallel": 2, "timeoutMs": 10000 }
  }
}
```

`effects` must refer to the ordinary input's observed-state fields. Candidates may change proposed actions only. Each child gets copied member state and a new identity whose lineage points back to the parent profile. The parent remains unchanged. Children inherit no environment variables or process arguments, load one fixed incumbent worker entry, and cannot choose a module or executable. The runtime waits for termination on success, error, cancellation or deadline. Memory limits constrain each V8 heap; a worker thread is not a security sandbox for untrusted code.

`runCognitiveMitosis` also accepts an `AbortSignal` for direct controller integrations. Receipts expose thread IDs, profile fingerprints, predictions and input digests; they do not include private memory references or credentials. This is a deterministic cognitive experiment, not an assertion that an LLM ran or that a proposed action was executed.

## Measured outcome and recombination

After a genuinely observed outcome arrives, the incumbent controller can call:

```typescript
const evaluation = evaluateCognitiveClones(run, {
  observedState: { queueDepth: 1 },
  observedAt: observation.timestamp,
  verification: {
    verified: observation.verified,
    sourceFingerprint: independentlyVerifiedCloneCycle.fingerprint,
    evidenceRefs: observation.evidenceRefs,
  },
});
```

The strongest forecast must improve on the baseline, retain an admitted cognitive decision and have independent evidence bound to its exact cycle fingerprint. Otherwise learning remains held. Promotion reuses the prediction-learning contract to produce a memory candidate. It does not mutate parent heuristics, authority, policies, model weights, or source code. Predictions are compared with the same observed outcome; this does not prove counterfactual outcomes for actions that were never executed.

## Structured generation and semantic retrieval

The TypeScript local inference adapter calls fixed Ollama loopback endpoints and reuses immutable-artifact admission and transient digest receipts:

```typescript
const channel = openTransientResultChannel({ ttlMs: 120000 });
const { value } = await generateLocalStructuredOutput({ prompt, schema }, { channel, signal });
const { embeddings } = await generateLocalEmbeddings({ texts: approvedMemoryStatements }, { channel, signal });
const first = embeddings[0]!;
const index = createSemanticIndex({ modelDigest: first.modelDigest, dimensions: first.vector.length });
records.forEach((record, i) => index.upsert({
  reference: `memory:${record.memoryId}`, ...embeddings[i]!,
}));
const matches = queryInstitutionalMemory({
  records,
  semantic: { index, query: queryEmbedding },
  classes: ["strategy"],
  limit: 10,
});
```

Only the caller's approved statements are embedded. Generate the query vector with the same admitted model. The index stays in memory and contains vectors and references only. Model digest and dimension mismatch, invalid vectors and exceeded capacity fail closed. Existing class, objective, capability and supersession filters apply before semantic ranking. Similarity does not establish factual confidence or grant authority.

The schema validator supports primitive types, nested objects/arrays, required fields, additional-property rejection, enum, and numeric/length/item/property bounds. It rejects unsupported schema keywords instead of silently ignoring them. Generated JSON is validated without coercion; schema and data depth/size are bounded. Evolution payloads now enforce their externalized schema in addition to existing path and line limits.

The adapter refuses missing/expired transient channels, unadmitted artifacts, remote-backed catalog entries, HTTP redirects, oversized/malformed responses, deadlines and cancellation. No model download, browser inference engine, provider activation or paid fallback is introduced. Current policy has no admitted models; a real model transaction requires a fresh artifact inspection/admission and an actual local runtime. Tokens alone do not satisfy those conditions.

## Existing building blocks

The Vercel AI SDK and Zod already exist in the one browser workspace. Mahoraga already provides stateful investigations, bounded tool dispatch, collective dissent, long-term memory, calibration and held-out backtesting. Adding a second LangGraph orchestration fabric or a vector database is unnecessary for these enhancements. Browser Transformers.js/ONNX execution remains outside the currently admitted runtime formats; it is not marked implemented or enabled.

Windows production remains `3.6.0`. Source tests, real thread execution, real model execution and live deployment are distinct evidence domains.
