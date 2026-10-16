# Held-out cognition campaign preparation and receipt ledger

Issues #540 and #624 still require independently controlled live evaluations.
`src/cognition-campaign.ts` supplies a content-free campaign commitment and receipt
ledger for the nine public cognition families. It adds signature attribution and
execution-chain gap accounting; it does not replace `mccb-report.ts`, score
answers, dispatch requests, or change any candidate capability.

The external evaluator retains the blinded inputs, ground truth, scoring code,
private signing key and isolation evidence outside candidate mutation authority.
This repository contains no hidden answers and cannot establish that separation.

## Operator workflow

1. Obtain fresh protected-main source provenance independently. Pass the exact
   lowercase 40-digit SHA as a CLI argument. The CLI checks equality; it does not
   discover main or prove the supplied SHA is current. Reevaluate every cell when
   main changes; older ledgers remain historical evidence.
2. Pin the evaluator's Ed25519 public key through an independently trusted channel.
   Store its SPKI PEM outside the supplied campaign bundle. A candidate-supplied
   public key, signature, evaluator digest or `independent: true` is not proof of
   evaluator independence. Unknown bundle fields are rejected.
3. Have the evaluator commit the signed manifest before revealing inputs or
   running candidates. Retain that commitment in an external immutable record.
   A valid signature alone does not prove when the commitment was made.
4. For each declared case/repetition/cohort, run the blinded input through the
   existing canonical UI → authority → router → execution → persisted receipt
   path. Retain original deployment, authenticated account/provider, execution,
   idempotency and postcondition evidence externally. Do not place prompts,
   outputs, credentials or autobiographical memory in this bundle.
5. Have the external evaluator sign one observation per cell, including HOLDs and
   failures. Leave unavailable chain references `null`. An empty observations
   list is a useful preflight: it emits the complete missing-work ledger.
6. Validate locally, then independently inspect the retained evidence and evaluator
   isolation. Join measurement `runId` and execution digest to the existing MCCB
   reporting input for descriptive metrics. This ledger deliberately calculates
   no quality, cohort mean, winner or statistical significance.

```bash
node scripts/cognition-campaign.ts campaign.json EXACT_CURRENT_SOURCE_SHA evaluator-public.pem > ledger.json
```

Only stdout is written. Both input files remain unchanged. JSON is bounded to
2 MiB, the key to 4 KiB, each must be a regular file, and errors emit bounded
reason codes. The CLI performs no network, provider, deployment or authority call.

## Signed bundle contract

The root contains exactly `manifest` and `observations`. Every signed envelope has
exactly `{payload, signature}`. Signatures are canonical unpadded base64url Ed25519
signatures. No public key or independence assertion is accepted inside the bundle.

Manifest payload fields are:

| Field | Contract |
| --- | --- |
| `schemaVersion`, `kind` | `1`, `cognition-campaign` |
| `campaignId`, `evaluatorVersion` | Opaque identifier |
| `sourceSha` | Lowercase 40-digit SHA, equal to the external expected-source argument |
| `evaluatorDigest`, `suiteDigest`, `costEnvelopeDigest` | Lowercase 64-digit digests of externally retained artifacts |
| `repetitions` | Integer 1–20, the same for every case and cohort |
| `cases` | Exactly nine unique `{caseId, inputDigest, requiredEvidence}` records |

All three existing MCCB cohorts are required in every case and repetition:
`strongest-individual`, `homogeneous`, `heterogeneous`. The maximum is 540 cells.
The evaluator must independently establish that those cohort labels describe the
actual selected routes and populations, including the strongest-individual choice.

| Public case ID | Challenge family from #540 |
| --- | --- |
| `minority-rescue` | Wrong majority with materially correct minority dissent |
| `uncertainty-hold` | Correct HOLD or seek-evidence behavior |
| `cross-domain-transfer` | Reject superficial analogy |
| `identity-continuity` | Continuity under contradictory teaching with private memory separation |
| `verified-social-learning` | Verified institutional promotion |
| `causal-intervention` | Intervention breaks a correlation-based prediction |
| `long-horizon-replan` | Mid-course state change requires replanning |
| `capability-composition` | Cognition plus repository/browser observation within zero-credit defaults |
| `future-authority` | Simulated future authorization grants no present authority |

`inputDigest` is unique per case and shared across its repetitions and cohorts so
that submitted comparisons cannot quietly switch blinded inputs. Digests bind
only submitted claims; the evaluator must compare actual executed inputs to them.
`requiredEvidence` is `execution` or `model-execution`, declared before execution.
The latter specifically requires a nonzero invocation count plus invocation and
execution references. Deterministic cognition can satisfy an `execution` cell but
cannot satisfy a `model-execution` cell.

Each observation payload has exactly these fields:

| Fields | Contract |
| --- | --- |
| `schemaVersion`, `kind` | `1`, `cognition-observation` |
| `campaignId`, `manifestDigest` | Exact signed campaign and manifest commitment |
| `runId`, `challengeId` | Unique opaque identifiers |
| `caseId`, `repetition`, `cohort` | One declared matrix cell |
| `sourceSha`, `deploymentSourceSha` | Both exactly the manifest source SHA |
| `deploymentId` | Opaque Cloudflare deployment identity |
| `evaluatorDigest`, `inputDigest` | Exact manifest/case bindings |
| `route`, `worker`, `provider` | `cloudflare` and opaque worker/provider identifiers |
| `outcome` | `completed`, `failed` or `held`, retained verbatim |
| `uncertainty`, `dissent` | Arrays of up to 32 unique opaque codes |
| `objectiveCandidateDigest`, `institutionalLearningCandidateDigest` | Digest or `null`; reference only, never promotion |
| `modelInvocations` | Integer 0–1,000,000; zero iff invocation evidence is absent |
| `evidence` | Exact stage object described below |

Evidence stage keys are `ownerRequest`, `authorityDecision`, `routing`, `execution`,
`modelInvocation`, `persistence`, `idempotency`, `postcondition`. Each is a digest
or `null`. These are references to externally retained evidence, not the contents
or verification of that evidence. All stages other than optional model invocation
are required for a gap-free observation. A nonzero invocation count requires both
execution and model-invocation references. Routing and execution references must
be distinct. Reused execution or model-invocation digests, run IDs,
challenge IDs and matrix cells are rejected, including signed replays.

Identifiers and codes are lowercase ASCII letters/digits/hyphens, 1–64 characters,
starting with a letter or digit. Never encode private content in identifiers or
codes. Records reject unknown keys; sparse arrays, noninteger numbers, undeclared
cells and changed provenance fail closed. No result text or unbounded free text
field exists.

## Signing and manifest identity

`campaignSigningPayload(kind, payload)` exposes the exact bytes for independently
implemented evaluator tooling. No private-key loading or signing is implemented
in production code. Canonical JSON recursively sorts object keys, preserves array
order and uses compact JSON strings, integers, booleans and `null`. The validator's
schema permits only bounded integer values and ASCII identifiers/digests.

Bytes are UTF-8:

```text
mahoraga-cognition-campaign-v1\nmanifest\n<CANONICAL_JSON_PAYLOAD>
mahoraga-cognition-campaign-v1\nobservation\n<CANONICAL_JSON_PAYLOAD>
```

The displayed `\n` sequences mean actual LF bytes, with no LF after the JSON.
`manifestDigest` is SHA-256 of the manifest signing bytes, including that prefix.
The prefix prevents a manifest signature from being reused as an observation.
The evaluator should pin its own signing implementation and protocol rather than
allow candidate revisions to control its private-key process.

## Reading the ledger honestly

Every planned cell is present. Missing observations remain `missing`. Observed
cells with absent chain references are `evidence-gaps`; references for all required
stages yield `execution-reported`. Execution kind separately distinguishes
`no-execution`, `routing-only`, `deterministic-execution` and `model-execution`. These describe
signed supplied claims, never a verified live transaction. HOLD and failed outcomes
remain in `observations` even with complete chain references. A legitimate HOLD
can be the correct answer; chain completeness is not an answer score.

The key fingerprint and `attribution=signature-valid-for-operator-supplied-key`
allow an operator to check which externally pinned key attested the claims. They
do not prove who controls that key, evaluator isolation, account identity,
deployment authenticity, held-out secrecy or actual execution. Consequently every
ledger always retains `independentEvaluationVerified=false`,
`liveExecutionVerified=false`, `cohortValidityVerified=false`,
`superiorityEstablished=false` and `authorityGranted=false`.

Independent live execution, authenticated retained receipt inspection, account and
cohort validity, evaluator isolation and blinded scoring remain necessary before
any acceptance or MCCB superiority claim. #547 failure injection, broader MCCB
controls, calibration, rollback and statistical interpretation also remain open.
Fixture tests and a complete signed ledger cannot close #540 or #624.
