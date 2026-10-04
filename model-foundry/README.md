# Mahoraga native model foundry — smoke tranche

This development-only experiment trains real next-token weights from seeded random initialization using cross-entropy gradients and SGD. The architecture is a dense bigram softmax (one-hot context through a trainable weight matrix), not a transformer or a general reasoner. It runs on bounded CPU data without downloading a model or calling a provider.

`src/native-model-foundry.ts` exposes training, save/load validation, next-token inference and candidate promotion eligibility. No manifest/provider/routing defaults change. No runtime route is registered and no production model is activated. This is the reproducibility foundation of #899, not completion of its native reasoning or frontier program.

The character tokenizer is built only from training data; held-out unknown characters map to `<unk>`. Rights metadata and evidence digests are mandatory. Training/evaluation source IDs and exact content hashes must be disjoint. This catches exact leakage, not semantic overlap; an independent evaluator must establish broader contamination control. Bounds: 32 sources/split, 8 KiB/split, 128 vocabulary entries including unknown, 200 epochs, at most 16,384 parameters.

Checkpoints contain tokenizer, numeric weights, a strict constitution/manifest and a content fingerprint. Manifests bind architecture/tokenizer versions, data/rights/configuration/code digests, seed, optimizer, run identity, parameter count, evaluation suite, limitations and candidate status. Raw training/evaluation text is not stored in the checkpoint. Digests provide content integrity, not authentication or proof of legal rights.

The test corpus is hand-authored alternating synthetic characters with separate source/content hashes. Tests prove actual training and held-out loss reduction, same-seed reproducibility, save/load equality and provider-free next-token prediction. They make no quality claim beyond this task.

Promotion eligibility requires independent evaluator identity/digest, exact evaluated checkpoint, an improved finite held-out loss, incumbent authority agreement and a separate rollback digest. Eligibility does not activate anything. A trusted incumbent must independently verify those assertions and retain the rollback artifact. Production inference route, tokenizer-training scalability, transformer architecture, independent evaluator execution, continual learning and real rollback activation remain future tranches.

Run `node --test test/native-model-foundry.test.ts` for the bounded experiment. The JSON checkpoint manifest contract is in `contracts/checkpoint.schema.json`.

## Native context learning tranche

`src/native-context-model.ts` adds a separately identified native architecture:
learned character and position embeddings, a last-prefix query with single-head
scaled dot-product attention, a residual connection, a tanh hidden readout and
next-token softmax. Analytic backpropagation trains every parameter from seeded
random initialization with shuffled SGD and gradient-norm clipping. The previous
bigram experiment and its checkpoint format remain supported. This compact
architecture is not the full stacked, normalized, multi-head Transformer.

The architecture follows the attention and positional-representation principles
in [Attention Is All You Need](https://arxiv.org/abs/1706.03762). Its implementation
and experiment are original TypeScript, use no model download/provider and make
no frontier-performance claim.

Each source is one fixed-width context followed by a supervised target. Only the
preceding context enters the network; the final target is excluded from attention.
The vocabulary comes solely from training sources. Source IDs, content digests,
and effective tokenized contexts must be disjoint across training/evaluation;
duplicate effective contexts within a split are rejected too. Rights assertions
still require independent provenance review. These checks do not prove semantic
non-contamination or independent evaluator identity.

Bounds are 32 examples per split, 8 KiB per split, 2–8 context characters,
4–16 embedding dimensions, 4–32 hidden units, 128 vocabulary entries, 200 epochs
and at most 16,384 parameters. Checkpoints have a separate strict contract in
`contracts/context-checkpoint.schema.json`; they bind data/rights/configuration
and code digests, dimensions, seed, optimizer and candidate status. Digests prove
content integrity, not authentic execution or promotion authority.

Run `npm run foundry:context` from a clean committed checkout. The CLI binds the
experiment to the actual Git HEAD and emits a bounded JSON receipt. Its three
predeclared seeds (7, 42, 1337) train on ten hand-authored selective-recall examples
and evaluate eight unseen context recombinations. Both labels occur equally for
every final context character: any predictor using only that character has a
50% accuracy ceiling on this evaluation sample. A qualified receipt requires
100% held-out accuracy for all three seeds, reduced held-out loss and unchanged
save/load predictions. The taught recall rule is shared across splits; these are
new combinations, not new tasks or evidence of general intelligence.

Tests also compare every analytic parameter gradient to finite differences,
prove identical-seed reproducibility and evaluation-independent weights/vocabulary,
and reject checkpoint mutation, data overlap, dimension/capacity drift and
production authority claims. Training/evaluation remains development-only.
No provider, owner bridge, runtime route, incumbent weights, model promotion,
execution authority or Windows production is changed.

Next research tranches remain separately testable: independent hidden-task
evaluation, verified-experience replay with retention tests, neural state/action
prediction, calibrated uncertainty, adaptive reasoning budgets and eventually
larger multi-layer architectures. Each requires its own evidence before promotion.

## Candidate continuation and replay

`continueNativeContextModel(parent, input)` resumes training from a copy of the
parent's actual weights. It never mutates the parent. The original v1 checkpoint
format and seeded initialization remain unchanged; continuations use the separate
v2 `contracts/context-continuation.schema.json` manifest. A continuation binds its
exact parent and rollback digest, root digest, generation, original initialization
seed, new shuffle seed, current corpora, source SHA and accumulated source history.
The parent training/evaluation corpora must match their recorded manifests.

The tokenizer and dimensions are pinned to the parent. Vocabulary growth requires
a future versioned expansion path. Historical evaluation IDs, content and effective
contexts stay reserved across every generation. Replaying an earlier training
source requires its exact content, rights and evidence metadata; renamed replay,
changed labels and rebound rights are rejected. History contains digests/rights
references, not raw text. Bounds remain 32 examples per training/update split,
8 KiB per split and 200 epochs per update; lineage is capped at 16 generations
and 512 reserved sources per history split. Digests do not authenticate rights,
training execution, ancestry supplied by an untrusted caller or a verifier.
Rollback pointers require separately retaining the actual parent artifact.

`qualifyNativeContextUpdate` recomputes real losses and predictions from both
checkpoints. It requires the complete earlier held-out suite (all reserved examples
for a v2 parent), exact current adaptation corpus, unchanged tokenizer/dimensions,
exact parent/rollback lineage, no unknown evaluation tokens, no old-task accuracy
regression, bounded retention-loss growth, perfect current-task accuracy and a
declared minimum loss reduction. It returns a same-process research qualification,
never independent evaluator authority or model promotion.

Replay follows the principle of mixing earlier training examples with new examples,
as studied in [Experience Replay for Continual Learning](https://arxiv.org/abs/1811.11682).
This is an original supervised SGD experiment, not an implementation of that paper's
reinforcement-learning/CLEAR system.

Run `npm run foundry:continual` from a clean committed checkout. The CLI binds the
actual Git HEAD, fixes seeds 7/42/1337 and uses the existing 510-parameter architecture.
Phase one learns recall with labels a/b on ten training/eight held-out examples.
Phase two adds labels c/d on eight new training/four held-out examples, using
100 epochs and learning rate 0.08 in each phase. The recall rule is shared: this
tests class-incremental learning, not new reasoning rules or general intelligence.
The development-selected experiment measures a replay candidate and the same
parent trained without replay. With replay, all three seeds learn the added labels
while retaining the earlier task; without replay the earlier task is forgotten
and qualification is held even though the new task succeeds.

The receipt also preserves a harder conditional copy/invert rule stress test.
That test remains short of full correctness under this fixed configuration and
is held by the accuracy gate. Capacity/epoch probes during development did not
establish reliable qualification of the harder rule. Do not hide this limitation
or reinterpret class growth as unseen-rule reasoning. Independent hidden tasks,
authenticated live-experience ingestion, durable model registry, learned world
transitions and incumbent-governed production promotion remain separate work.
The CLI emits counts, scores and hashes, with no corpus text, rights evidence
contents, weights, provider calls or authority changes. Windows stays `3.6.0`.
