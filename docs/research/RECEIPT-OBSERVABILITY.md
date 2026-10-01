# Acceptance receipt observations

The cockpit projects the existing `cloudflare-execution-runtime-acceptance` report from paired health acceptance metadata. No browser token, endpoint, provider call or authenticated API route is added. Missing evidence stays unobserved.

A receipt must match both expected source and observed deployment SHA, be at most 15 minutes old (one minute future skew), use bounded allowlisted fields, and show at most one provider execution and one receipt. Replay/conflict responses are separate counts. Unknown fields, bypassed reports, invalid identifiers, stale source, deployment drift and invalid time hold the projection without rendering input values.

Provider cognition additionally requires explicit model/provider identity, hard-zero billing/fail-closed proof, actual execution and execution uniqueness. Transport readiness cannot imply cognition. Access, transport, cognition, durable result and traffic observations have separate cards. This projection is read-only, does not independently authenticate its producer, and grants no authority.

The existing acceptance report is a test-transaction aggregate; it lacks per-request task/objective/AuthorityDecision/relay lineage. #452 therefore remains open pending runtime-supplied sanitized per-request evidence and exact-head owner-paired acceptance. Universal broker copy describes the existing private canonical binding and selection contract; it does not claim observed live presence or successful handoff.
