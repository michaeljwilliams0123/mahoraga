# Credit-free autonomy

Mahoraga stays autonomous only when execution can continue without paid inference.

## Rule

Credit-free autonomy is fail-closed.

- Deterministic local planes (`repository`, `local-core`, `self-healer`, `steward-learning`) are admissible at `$0`.
- Local reasoners (`ollama`, `lm-studio`, `local-reasoner`) are admissible only when live-ready and unmetered.
- Subscription-local Codex Builder is not treated as credit-free. It may exist, but this selector will not dispatch it.
- Metered providers (`openai-platform`, `github-copilot`, `workspace-agent-cloud`, `codex-cloud`) are forbidden.
- Paid fallback is never a recovery path.
- A non-zero spend grant or Platform API key blocks dispatch.

## How to keep it

1. Prefer local models or deterministic workers over cloud APIs.
2. Keep OpenAI Platform API disabled.
3. Do not wire Copilot/Codex Cloud as an automatic fallback.
4. Record receipts with `creditCost: 0` and `paidFallback: false`.
5. If no credit-free plane is ready, leave the task planned. Do not buy a route.

## Contract

`src/credit-free-autonomy.mjs` is the selector and zero-credit health attestation used by later routing work. It does not activate Windows production and does not change the four-hour sovereign cycle.
