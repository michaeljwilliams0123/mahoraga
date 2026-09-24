# Cloudflare hard-zero cognition boundary

Mahoraga does not require a second Cloudflare account to enforce a zero-dollar Workers AI route.

The existing account can host the isolated `mahoraga-zero-credit-inference` Worker while the Worker itself enforces a stricter daily budget than Cloudflare's free Workers AI allocation. Cloudflare currently provides 10,000 Workers AI neurons per day at no charge. Mahoraga reserves against an internal 9,000-neuron daily ceiling before every inference request and fails closed when that ceiling is reached. This keeps a 1,000-neuron safety buffer and prevents Mahoraga from consuming beyond its own free-allocation budget even if the account temporarily reports the Standard usage model during trial or transition.

The execution runtime itself has no Workers AI binding. Only the isolated inference Worker may call Workers AI.

## Budget contract

- Cloudflare free allocation: 10,000 neurons/day.
- Mahoraga internal ceiling: 9,000 neurons/day.
- Inference reservation: 128 neurons before each model call.
- Probe reservation: 4 neurons before each canary.
- Input payload cap: 8,000 UTF-8 bytes per inference request.
- Output cap: 256 tokens per inference request and 8 tokens per probe.
- Reservations are persisted transactionally in a SQLite Durable Object and reset by UTC day.
- Failed provider calls are not refunded, making the ledger intentionally conservative.
- Budget exhaustion returns a provider gap; there is no paid/model/Railway fallback.

The internal reservations are intentionally much larger than the published GLM-4.7-Flash nominal neuron rate for the bounded request sizes. Admission therefore relies on the checked-in budget contract plus fresh provider identity/SHA evidence, not on `default_usage_model` alone.

## Activation gates

Do not activate live cognition until all of these are independently evidenced:

1. `mahoraga-zero-credit-inference` is deployed at the expected GitHub SHA.
2. Its Workers AI binding is the only AI binding in the cognition path; the execution runtime remains binding-free.
3. The daily budget Durable Object is bound and a probe returns the fixed 10,000/9,000 allocation boundary.
4. Provider admission validates account identity, exact SHA, model identity, and budget boundary before becoming routable.
5. One synthetic cognition canary succeeds without Railway traversal.
6. Reusing the same idempotency key returns the durable prior receipt without a second provider invocation.

Canonical traffic authority remains a separate later gate. Railway remains untouched rollback infrastructure.
