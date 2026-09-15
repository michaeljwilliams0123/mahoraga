# Single Mahoraga Brain / Dual Execution Slots Design

## Purpose
Mahoraga must expose one operational brain while retaining a safe candidate slot for verification and rollback.
The user should never need to choose between ports 4782 and 4783 when communicating with Mahoraga.

## Authority model
- Port 4782 is the only authoritative local runtime.
- 4782 owns durable tasks, objectives, conversations, improvements, institutional state, authority decisions, and normal worker execution.
- Port 4783 is a non-authoritative candidate/shadow slot only.
- 4783 keeps isolated candidate state solely for migration/canary/rollback evidence and must never become a normal user interaction target.
- Cloud owner/runtime traffic continues to target canonical 4782 through the authenticated gateway.

## Candidate lifecycle
Scheduled convergence may start 4783 only when candidate verification is needed.
A convergence cycle verifies protected main, starts or replaces 4783, proves exact-source health/current provenance, promotes and verifies 4782, writes bounded receipts, then stops 4783.
A failed candidate may be rolled back long enough to capture bounded evidence, but rollback/candidate processes must not remain a second always-on brain after the convergence attempt terminates.

## Safety and state rules
- Never point both supervisors at the same writable SQLite database.
- Never migrate candidate conversations/tasks into 4782 merely because they exist; production durable state remains authoritative.
- Preserve candidate state files for forensic/rollback use unless an existing bounded cleanup policy explicitly retires them.
- Preserve authentication, content-vault encryption, evaluator/protected checks, rollback, source-provenance gates, and zero-credit defaults.
- Do not expose either raw loopback listener publicly.

## User interaction contract
Normal communication has one logical target: the canonical cloud/Control Center surface backed by 4782.
Status should make the active/candidate distinction unambiguous. 4783 may be absent during ordinary operation; that is healthy, not degraded.
A successful convergence receipt must prove both that 4782 is current/healthy and that no 4783 listener remains afterward.

## Acceptance criteria
1. Existing deterministic Verify remains green.
2. Convergence tests prove absent 4783 is bootstrapped transiently, verified, promoted to 4782, and stopped in the same cycle.
3. An already-current 4783 candidate is promoted/verified and then stopped before convergence exits.
4. Failure paths do not silently promote an unverified candidate or weaken rollback/provenance checks.
5. Live post-change state shows healthy exact-main 4782, no 4783 listener during normal operation, and canonical Railway readiness remains healthy.
6. A real communication transaction through the canonical user-facing path is empirically verified; if auth/session state prevents it, that blocker is reported rather than bypassed.
