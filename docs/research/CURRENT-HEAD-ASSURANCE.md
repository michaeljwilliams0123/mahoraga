# Current-head secondary assurance

`validateGitLabAssurance` now delegates to the bounded TypeScript validator. Callers supply independently collected GitHub and GitLab ledgers and an authoritative-main observation. Each observation includes `observedAt`; main includes `repositoryIdentity` and a full 40-character `commitSha`. Ledgers additionally carry `branch: main`, matching `workflowVersion`, and a nonempty set of unique successful command IDs. GitLab `passed` and GitHub `success` are equivalent.

The CLI ignores any caller-authoritative main assertion and resolves the fixed repository's GitHub main ref itself. Network/authentication/unavailable evidence fails closed. No credential is added or logged. Observations expire after five minutes by default; future skew is bounded to 30 seconds. Matching two old ledgers is explicitly stale-source evidence.

The promotion executor contract binds objective, exact source, successful Verify run, independently observed identity/provenance digest, capability, health, labels, authority epoch and deployment identity. It compares scheduled and immediately-before-mutation observations and holds on drift or stale evidence. This is a validation primitive, not live attestation or production activation. #663 stays open until the canonical producer supplies independently authenticated observations and invokes the contract at its actual mutation boundary. A caller's `independent: true` is not authentication.

Vercel remains retired and non-authoritative. GitLab remains secondary assurance; its result never grants Cloudflare deployment or traffic authority. #580 still requires a fresh live GitLab assurance transaction.
