# Credit-free quota hold and UTC resume

Mahoraga stays autonomous after the Cloudflare Workers AI free allocation is exhausted by **waiting**, not by spending.

This contract is additive. It does not lift the #786 freeze, restore Railway, open Unified Billing, or change production traffic authority. Exact-head Cloudflare acceptance of a later SHA remains a separate gate.

## 2026-09-26 research applied

- Workers AI Free still allocates a daily pool that resets at **00:00 UTC**. Published figures vary between 10,000 neurons/day and 10,000 tokens/day; Mahoraga keeps the stricter **9,000 internal ceiling** already used by the isolated inference Worker.
- `@cf/zai-org/glm-4.7-flash` remains the admitted hard-zero cognition model. Frontier / paid-plan models are not a recovery path.
- Cloudflare **Unified Billing** and prepaid AI Gateway credits are contamination. They convert a free allocation into a spend grant.
- A Workers Paid plan is not required for GLM-4.7-Flash and must not be treated as the way to keep autonomy alive after the daily cap.
- Hosted "free" keys (Groq, Gemini, Hugging Face, OpenRouter) remain metered. Codespaces minutes remain billed compute.
- True autonomy is: **hold the objective, preserve the idempotency key, resume after UTC reset on the same hard-zero route.**
- 2026-10-16 observation (InfraOne, 19 days through 2026-10-16): the documented 00:00 UTC reset is necessary but not sufficient. The daily-limit error continued after midnight on 11 days. Time to first success was median 9.0 minutes and max 112.6 minutes. Queued work therefore stays on `quota-hold-reset-propagation` until a content-free ready receipt for the **new** UTC day exists, or 113 minutes elapse. A stale ready flag from the exhausted day does not resume. Buying Workers Paid is not the recovery path.

## Legal next actions

| Action | Meaning |
| --- | --- |
| `dispatch-hard-zero` | Fresh hard-zero billing, admitted model, remaining budget. |
| `quota-hold-until-utc-reset` | Ceiling reached. Queue the objective. Do not buy a model. |
| `quota-hold-reset-propagation` | Clock reset happened. Pool readiness is unproven. Keep the same idempotency key until a same-day content-free ready receipt or 113 minutes. |
| `resume-queued` | New UTC day, same idempotency key, still hard-zero. |
| `refuse-paid-route` | Unified Billing, Workers Paid, prepaid credits, spend grant, or model/provider drift. |

`paidFallback` is always `false`. `creditCost` is always `0`.

## Bounds

- Free allocation: 10,000 / UTC day
- Internal ceiling: 9,000
- Inference reservation: 128 before each model call
- Probe reservation: 4 before each canary
- Duplicate idempotency keys do not execute twice
- Failed provider calls are not refunded

Source: `src/credit-free-quota-resume.mjs`.
Tests: `test/credit-free-quota-resume.test.mjs`.
