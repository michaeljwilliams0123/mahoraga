# Mahoraga native model foundry — smoke tranche

This development-only experiment trains real next-token weights from seeded random initialization using cross-entropy gradients and SGD. The architecture is a dense bigram softmax (one-hot context through a trainable weight matrix), not a transformer or a general reasoner. It runs on bounded CPU data without downloading a model or calling a provider.

`src/native-model-foundry.ts` exposes training, save/load validation, next-token inference and candidate promotion eligibility. No manifest/provider/routing defaults change. No runtime route is registered and no production model is activated. This is the reproducibility foundation of #899, not completion of its native reasoning or frontier program.

The character tokenizer is built only from training data; held-out unknown characters map to `<unk>`. Rights metadata and evidence digests are mandatory. Training/evaluation source IDs and exact content hashes must be disjoint. This catches exact leakage, not semantic overlap; an independent evaluator must establish broader contamination control. Bounds: 32 sources/split, 8 KiB/split, 128 vocabulary entries including unknown, 200 epochs, at most 16,384 parameters.

Checkpoints contain tokenizer, numeric weights, a strict constitution/manifest and a content fingerprint. Manifests bind architecture/tokenizer versions, data/rights/configuration/code digests, seed, optimizer, run identity, parameter count, evaluation suite, limitations and candidate status. Raw training/evaluation text is not stored in the checkpoint. Digests provide content integrity, not authentication or proof of legal rights.

The test corpus is hand-authored alternating synthetic characters with separate source/content hashes. Tests prove actual training and held-out loss reduction, same-seed reproducibility, save/load equality and provider-free next-token prediction. They make no quality claim beyond this task.

Promotion eligibility requires independent evaluator identity/digest, exact evaluated checkpoint, an improved finite held-out loss, incumbent authority agreement and a separate rollback digest. Eligibility does not activate anything. A trusted incumbent must independently verify those assertions and retain the rollback artifact. Production inference route, tokenizer-training scalability, transformer architecture, independent evaluator execution, continual learning and real rollback activation remain future tranches.

Run `node --test test/native-model-foundry.test.ts` for the bounded experiment. The JSON checkpoint manifest contract is in `contracts/checkpoint.schema.json`.
