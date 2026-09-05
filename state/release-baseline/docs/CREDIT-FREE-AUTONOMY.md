# Credit-free autonomy

Mahoraga stays autonomous only when execution can continue without paid inference.

## Rule

Credit-free autonomy is fail-closed.

- Deterministic local planes (`repository`, `local-core`, `self-healer`, `steward-learning`, `browser`, `desktop`) are admissible at `$0`.
- Local reasoners (`ollama`, `lm-studio`, `local-reasoner`) are admissible only when live-ready and unmetered.
- Subscription-local Codex Builder is not treated as credit-free. It may exist, but this selector will not dispatch it.
- Metered providers (`openai-platform`, `github-copilot`, `workspace-agent-cloud`, `codex-cloud`) are forbidden.
- Paid fallback is never a recovery path.
- A non-zero spend grant or Platform API key blocks dispatch.
- Hosted free-tier compute (Vercel daily deploy cap, duplicate projects, Codex review quotas) is not a spend grant, but exhausting it still forces `hold-planned`. Buying a higher tier is not a recovery path.

## Protocol graph

When `creditFreeRequired` is set, or the paired runtime forces `zero-codex`, conversation objectives use the bounded protocol instead of Codex.

Default containment (Act / repair / autonomous-action):

1. **Observe** `repository.status`
2. **Decide** `system.health`
3. **Act** `repair.scan`
4. **Verify** `repository.verify`
5. **Repair** `repair.apply` (incident-only; healthy systems no-op)
6. **Report** `repository.verify` with `merge-after-verify`

Inspect-only requests skip mutation nodes and report status. Hybrid conversation mode still uses the Codex debate DAG. The zero-credit route never falls through to that DAG.

If the request is a source mutation and no local reasoner is live, the containment graph still runs and a `stewardGap` is recorded: model-backed edits wait for Ollama / LM Studio or an owner-authorized dispatch. Containment is not a fake implementation.

## Unattended heartbeat

True autonomy cannot wait for a chat turn. `src/autonomy-heartbeat.mjs` is the always-on credit-free loop:

1. Observe bounded world metadata (HEAD, worker ids, task counts, open issue/PR counts). No prompts, chats, or credentials.
2. Decide with `maintainCreditFreeAutonomy`. Legal waits: `refuse-paid-route`, `hold-planned`, `wait-for-local-reasoner`.
3. Act only when `nextAction` is `dispatch-credit-free`. Inspect heartbeats skip mutation nodes.
4. Verify the same fail-closed health attestation.
5. Repair remains incident-only.
6. Report a content-free receipt with `creditCost: 0` and `paidFallback: false`.

The four-hour candidate cycle runs this heartbeat as a preflight. A refused paid route or exhausted hosted-compute cap holds the cycle instead of buying a provider. Compounded learning (`compoundCreditFreeLearning`) stores method identifiers and success/hold counts only.

## How to obtain and keep it

1. Prefer local models (Ollama, LM Studio, a verified open-weight Codespace) or deterministic workers over cloud APIs.
2. Keep OpenAI Platform API disabled. Do not treat Hugging Face free-tier inference as a guaranteed route; rate limits become `hold-planned`.
3. Do not wire Copilot / Codex Cloud as an automatic fallback. GitHub Actions Verify, Dependabot, CodeQL, Destiny envelope validation, and the four-hour cycle already run at zero model credits.
4. Record receipts with `creditCost: 0` and `paidFallback: false`.
5. If no credit-free plane is ready, leave the task planned. Do not buy a route.
6. Run `maintainCreditFreeAutonomy` and `runCreditFreeHeartbeat` before a cycle or conversation dispatch. Legal waits: `refuse-paid-route`, `hold-planned`, `wait-for-local-reasoner`.
7. Do not burn hosted free quotas. Extra Vercel projects multiply deploys; the free cap is 100/day. Codex code-review credits are not autonomy — use Verify, not paid review bots.
8. Compound knowledge in steward-learning and heartbeat receipts at `$0`. Never spend to “check if work exists.”
9. Treat GitHub Actions as the durable scheduler, not a model host. Public-repo minutes stay free; the only spend to avoid is inference.
10. Keep a live local reasoner for source mutations. Deterministic inspect/repair continues without it. Paid fallback is never the missing-model recovery path.

## 2026 local-first constraints

Applied from current local-first agent practice. These are constraints, not a stack replacement.

- Inference is optional. The durable loop is Observe → Decide → Act → Verify → Repair-or-hold → Report at `$0`.
- Open-weight local models (Qwen / Llama class via Ollama or LM Studio) are the only generation plane. Cloud APIs are contamination.
- Unattended work uses GitHub Actions + the heartbeat, not a chat session.
- Skill compounding stays identifier-only (method ids, hold/dispatch counts). No prompt or chat storage.
- Quota exhaustion and missing local reasoners are legal waits. Upgrades and paid fallbacks are not.
- Do not add extra Vercel projects or paid review bots to “speed up” autonomy.

## Loopback reasoners

`src/local-reasoner-provider.mjs` probes **both** loopback endpoints in parallel and keeps no model identifiers:

- Ollama `http://127.0.0.1:11434/api/tags`
- LM Studio `http://127.0.0.1:1234/v1/models`

Either endpoint with loaded models is sufficient to mark the local reasoner live. Execution stays disabled until a transient result channel exists. Missing or empty reasoners are a legal wait, never a paid recovery.

## Destiny trigger in the heartbeat

The unattended heartbeat folds the Destiny Event Dispatch Lane readiness into every receipt.

- Deterministic inspect/repair continues at `$0` while the trigger is `unconfigured`, `unknown`, or stale.
- Model-backed Destiny dispatch (`modelBackedDispatch`) fails closed with `hold-planned` until a dedicated actor or signed receipt is bound.
- Owner comments are not execution proof. `config/destiny-trigger-trust.json` remains the non-secret source of truth and stays `unconfigured` until an independent actor is provisioned.
- Zero-credit health never fires a model to probe Destiny. Unknown is the legal state.

## Durable ledger

`src/heartbeat-ledger.mjs` keeps an append-only, content-free receipt log (method identifiers, next-action counts, Destiny unreadiness). Duplicates are suppressed. Paid contamination is rejected. The file-backed copy lives outside Git.

## Contract

`src/credit-free-autonomy.mjs` is the selector, protocol graph, hosted-compute attestation, and zero-credit health used by routing, the four-hour cycle, and zero-codex conversation intake. `src/autonomy-heartbeat.mjs` is the unattended loop and compounded learning digest. `src/heartbeat-ledger.mjs` is the durable content-free receipt log. Conversation objectives pass live `creditFreeContext` (local reasoner readiness, spend grant, hosted compute) instead of defaulting those facts to zero. This does not activate Windows production and does not change the four-hour sovereign cadence.
