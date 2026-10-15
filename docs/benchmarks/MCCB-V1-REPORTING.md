# MCCB-v1 descriptive measurement reports

Issue #624 already has a controlled benchmark design, control gates and strength
targets. `src/mccb-report.ts` and `scripts/mccb-report.ts` add measurement accounting
for that design. They do not execute a benchmark, score answers, authenticate an
evaluator, establish a strongest individual, grant authority or promote a model.
No provider, network, training, account dispatch or runtime route is invoked.

## Run the reporter

```bash
node scripts/mccb-report.ts measurements.json > report.json
```

The CLI reads one regular JSON file, at most 2 MiB, and writes only the report to
stdout. The input remains unchanged. Invalid input produces a bounded reason code
on stderr and exit 1; paths, payloads and raw filesystem errors are not reflected.
Generated measurement/report files are not automatically committed or published.

## Input contract

The root has exactly these fields:

| Field | Contract |
| --- | --- |
| `schemaVersion`, `kind` | `1`, `mccb-measurements` |
| `sourceSha` | Lowercase 40-digit source SHA |
| `suiteDigest`, `evaluatorDigest`, `costEnvelopeDigest` | Lowercase 64-digit digests |
| `budget` | Exactly `maxDurationMs` (1–1,000,000,000), `maxCostMicros` (0–1,000,000,000), `maxWorkers` (1–64); integers |
| `cases` | 1–32 unique `{caseId, repetitions}` records; repetitions 1–20 |
| `runs` | 0–1,920 measurement records described below |

IDs are opaque lowercase ASCII letters/digits/hyphens, 1–64 characters, starting
with a letter or digit. Do not encode prompts, answers, names, secrets or private
memory in identifiers. All records reject unknown keys; no free-text fields exist.
Digests are references to independently retained evidence, not evidence contents.

Each run has exactly these fields:

| Field | Contract |
| --- | --- |
| `runId`, `caseId` | Opaque IDs; the case must be declared |
| `repetition` | Integer 1 through that case's declared repetition count |
| `cohort` | `strongest-individual`, `homogeneous`, or `heterogeneous` |
| `sourceSha`, `suiteDigest`, `evaluatorDigest`, `costEnvelopeDigest` | Exact match to root provenance |
| `evidenceDigest` | Unique lowercase 64-digit execution-measurement receipt digest |
| `outcome` | `completed`, `failed`, or `held`, as reported by the supplied measurement |
| `quality` | Finite normalized score 0–1, or `null` for unscored; no scoring is performed here |
| `durationMs`, `costMicros`, `duplicateEffects` | Integers 0–1,000,000,000; monetary costs use millionths of a dollar |
| `workers` | Integer 1–64 |
| `controlViolations` | Unique codes from the list below, including an empty list |

Accepted control codes: `unauthorized-action`, `covert-channel`,
`credential-propagation`, `authority-expansion`, `evaluator-mutation`,
`identity-ambiguity`, `budget-exceeded`, `duration-budget-exceeded`,
`cost-budget-exceeded`, `worker-budget-exceeded`, `duplicate-side-effect`.

Reported duration/cost/worker budget overruns and nonzero duplicate effects add
their corresponding violation codes even if the input omits them. A reported
completed outcome never suppresses a control failure. This covers measured bounds,
not every control required by the full MCCB program (such as authenticated account
identity, spawn depth, retry caps or evaluator isolation).

Duplicate run IDs, matrix cells or receipt digests are rejected rather than counted
as independent executions. A replay of one receipt is not a new repetition. The
receipt digest must identify the execution measurement record, not merely a shared
underlying research/evidence source. New repetitions require new execution receipts.

## Output and interpretation

Every declared case/repetition expects all three cohorts. Absent cells appear in
`missing`; absent cohorts have zero runs and null means. `coverage` says only whether
that matrix is complete. It is independent of `controlStatus`, which is either
`violations-reported` or `no-violations-reported`; neither is an independent PASS.

The report retains normalized `rawRuns`, including failures, HOLDs, unscored results
and violation codes. Cohort summaries keep separate outcome counts, quality
observation/missing counts and mean, duration/cost totals and means, duplicate-effect
counts and numbers of runs with violations. Quality means exclude null scores;
their explicit denominators and outcome counts must accompany any interpretation.
No failed/HOLD result is silently dropped. No composite score, winner, significance
test or confidence interval is invented. Repetition counts and raw observations
remain available for independently specified statistical analysis.

Canonical case/run/code ordering gives the same SHA-256 report fingerprint for
reordered equivalent inputs. Returned objects are recursively frozen. The fingerprint
proves content identity only: it is not a signature, authenticated execution receipt,
freshness observation, independent evaluator proof or promotion decision.

Every output therefore contains:

```json
{
  "inputTrust": "not-authenticated",
  "independentEvaluationVerified": false,
  "superiorityEstablished": false,
  "authorityGranted": false
}
```

An independently controlled evaluator must still retain/verify the exact held-out
corpus, scorer, case/repetition matrix, cost envelope, cohort selection, attributable
execution receipts and failure/recovery/control evidence. Candidates must not mutate
those resources. Structurally matching self-supplied hashes cannot establish that
independence or prove the source was accepted main. Control violations remain hard
failures for benchmark qualification; this descriptive tool grants no qualification.

Do not close #624 from fixture reports or a green repository build. Real blinded
three-cohort runs, #540's held-out challenges, #547's live failover evidence and the
program's other independent acceptance criteria remain open.
