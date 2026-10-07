# Route and memory verification follow-up

Source baseline: `c07f7143d7b309f4665f6b3e86e1e72f47840f87` (post-#1011 squash merge).
Accountable maintainer: `@michaeljwilliams0123`.
Tracking: [MIC-18](https://linear.app/michael-williams-mahoraga/issue/MIC-18).

## Confirmed findings and disposition

| Area | Reproduction | Correction |
| --- | --- | --- |
| Paired OpenAI route readiness | An old or future observation remained routable; the projection timestamp hid the evidence age. | Apply the existing 15-minute write-canary TTL, reject future observations, and expose `lastObservedAt` and `lastVerifiedAt`. |
| Paired route capacity and health | `ready: true` overrode offline availability and a full workload. | Require healthy/busy availability and spare configured capacity. |
| Paired worker identity | Distinct routes could share one worker ID, making selection/attribution ambiguous. | Reject duplicate worker identities during registry validation. |
| PR #1011 lesson persistence | A 64-character turn digest plus `:lesson` produced a 71-byte Vectorize ID. | Hash the lesson identity to 64 characters; reject oversized IDs before D1 writes. |
| PR #1011 memory maintenance | A 500-record page required 503 D1 queries and up to 501 bound parameters. | Batch marking, clearing, and deletion into groups of 99, reserving one parameter for time. |
| PR #1011 generated reports | Runtime test side effects cleared unrelated committed institutional memory/objective reports. | Restore both reports to the main baseline in the PR. |
| PR #1013 cockpit copy | Deployment implementation terminology failed the existing cockpit contract. | Describe renewal continuity without internal credential names; preserve workflow-binding checks. |
| PR #1020 convergence | Main and the PR added neighboring cockpit imports. | Preserve both cards in a normal merge commit; do not rewrite branch history. |

## Validation

- Paired route regression tests failed before the fixes; route/registry tests then passed (24 tests).
- PR #1011 tests reproduced the 71-byte identity and 503-query maintenance failures. The corrected branch passed all 63 Cloudflare integration tests, root/Cloudflare type checks, three memory unit tests, and all 15 runtime tests.
- PR #1013 passed 289 UI tests, type checking, and a production build.
- PR #1020 passed 290 UI tests, type checking, and a production build.
- The prior PR #1011 Windows check reported `worker-shutdown-timeout:codespaces-open-weight`. Local runtime tests passed; this does not establish the Windows cause or replace the required Windows check.
- Exact-head Ubuntu and Windows Verify remain mandatory. Owner requested ordered squash integration on 2026-10-07; exact-head verification remains mandatory after each source-head refresh.

## Evidence boundaries

This is a bounded source/PR review, not a claim that every repository defect has been eliminated. No production provider, billing, credential, deployment, or model-execution configuration was activated. These changes improve evidence quality and remove concrete obstacles to cognitive memory persistence; they do not prove general intelligence or live model execution.

Cloudflare Vectorize mutations are asynchronous. D1's existing `indexed` field records accepted submission; actual retrieval is established by a subsequent Vectorize query, not by the mutation acknowledgement. Production memory acceptance, provider readiness, and runtime convergence need their own live evidence.

References: [Vectorize limits](https://developers.cloudflare.com/vectorize/platform/limits/), [D1 limits](https://developers.cloudflare.com/d1/platform/limits/), [Vectorize API](https://developers.cloudflare.com/vectorize/reference/client-api/).
