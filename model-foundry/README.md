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
