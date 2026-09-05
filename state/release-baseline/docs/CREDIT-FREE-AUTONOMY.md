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
10. Keep a live local reasoner for source mutations. Probe Ollama at `127.0.0.1:11434` and LM Studio at `127.0.0.1:1234`. Either unmetered loopback is enough. Deterministic inspect/repair continues without a model. Paid fallback is never the missing-model recovery path.
11. Obtain autonomy by keeping GitHub public-repo Actions, deterministic workers, and one local open-weight server. Maintain it by never adding extra Vercel projects, never enabling the Platform API, and never treating Copilot review credits as a heartbeat.

## Contract

`src/credit-free-autonomy.mjs` is the selector, protocol graph, hosted-compute attestation, and zero-credit health used by routing, the four-hour cycle, and zero-codex conversation intake. `src/autonomy-heartbeat.mjs` is the unattended loop and compounded learning digest. Conversation objectives pass live `creditFreeContext` (local reasoner readiness, spend grant, hosted compute) instead of defaulting those facts to zero. This does not activate Windows production and does not change the four-hour sovereign cadence.
