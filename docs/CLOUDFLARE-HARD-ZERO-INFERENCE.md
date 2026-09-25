# Cloudflare hard-zero cognition boundary

Mahoraga does not require a second Cloudflare account to enforce a zero-dollar Workers AI route.

The exact-main cutover and hourly renewal must read the account's current subscriptions before admitting the provider. A Cloudflare API token with **Account → Billing → Read** permission for the same account is required by the subscriptions endpoint. Store a billing-only token as the GitHub Actions repository secret `CLOUDFLARE_BILLING_READ_TOKEN`; the deployment token remains `CLOUDFLARE_API_TOKEN`. The billing token is used only for the subscription read. If the separate secret is absent, the deployment token is tried, but it must itself have Billing Read. A 403 stops deployment and renewal with `cloudflare-subscriptions-billing-read-required-403`. Never paste either token into repository files or CI logs.

The existing account can host the isolated `mahoraga-zero-credit-inference` Worker while the Worker itself enforces a stricter daily budget than Cloudflare's free Workers AI allocation. Cloudflare currently provides 10,000 Workers AI neurons per day at no charge. Mahoraga reserves against an internal 9,000-neuron daily ceiling before every inference request and fails closed when that ceiling is reached. This keeps a 1,000-neuron safety buffer. Current cutover admission additionally requires fresh evidence of the Free account usage model and no billable subscriptions; Standard, trial, or unverifiable billing evidence stops admission.

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

The 2026-09-25 exact-main hosted acceptance receipt for `eabfedd95877847bc8cdf407dfe0559d7a56bcbe` proves the Cloudflare execution runtime's route and live cognition. A later merged SHA requires a new acceptance receipt. Owner-browser/gateway and custom-domain traffic authority remain independent gates. Railway remains non-routing rollback infrastructure.
