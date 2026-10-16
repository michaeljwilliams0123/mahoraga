# Current-head secondary assurance

`validateGitLabAssurance` now delegates to the bounded TypeScript validator. Callers supply independently collected GitHub and GitLab ledgers and an authoritative-main observation. Each observation includes `observedAt`; main includes `repositoryIdentity` and a full 40-character `commitSha`. Ledgers additionally carry `branch: main`, matching `workflowVersion`, and a nonempty set of unique successful command IDs. GitLab `passed` and GitHub `success` are equivalent.

The CLI ignores any caller-authoritative main assertion and resolves the fixed repository's GitHub main ref itself. Network/authentication/unavailable evidence fails closed. No credential is added or logged. Observations expire after five minutes by default; future skew is bounded to 30 seconds. Matching two old ledgers is explicitly stale-source evidence.

The promotion executor contract binds objective, exact source, successful Verify run, independently observed identity/provenance digest, capability, health, labels, authority epoch and deployment identity. It compares scheduled and immediately-before-mutation observations and holds on drift or stale evidence. This is a validation primitive, not live attestation or production activation. #663 stays open until the canonical producer supplies independently authenticated observations and invokes the contract at its actual mutation boundary. A caller's `independent: true` is not authentication.

Vercel remains retired and non-authoritative. GitLab remains secondary assurance; its result never grants Cloudflare deployment or traffic authority. #580 still requires a fresh live GitLab assurance transaction.

## GitHub executor observation

`scripts/promotion-executor-observation.ts` now provides a read-only producer of a
`github-promotion-executor-observation` receipt. With an existing `GH_TOKEN` or
`GITHUB_TOKEN` authorized for Actions read, invoke:

```sh
node scripts/promotion-executor-observation.ts \
  --run-id 42 --run-attempt 2 --job-id 71 \
  --expected-sha aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
```

The IDs are selectors, not executor assertions. The observer obtains runner ID,
runner name, runner group, selected labels, job status/conclusion and current run
status/conclusion from GitHub's REST API. It accepts only the fixed Mahoraga
repository, canonical Cloudflare execution workflow, main branch, matching source
SHA, selected job and exact run attempt. A current-run read before and after the
attempt-specific jobs read rejects reruns/source/identity drift during collection.
No API host, repository, workflow, credential file or executable is caller-selected.
The adapter uses three authenticated GETs, disallows redirects, limits each body to
1 MiB, rejects truncated/more-than-100-job attempts, and bounds collection to ten
seconds. Errors and receipts exclude tokens and upstream response bodies.

This receipt establishes **GitHub-observed scheduling metadata**, not cryptographic
substrate identity. `observedAt` timestamps the API collection; it does not refresh
an old job's capability-health proof. Runner labels remain scheduling claims,
runner names may be reused, and even a runner ID does not establish which hardware,
image or upstream human account executed the work. Failed run/job conclusions are
preserved. Missing group names remain null. The receipt explicitly records
`substrateIdentity: unattested`, `capabilityHealth: unassessed` and
`promotionAuthority: unassessed`; no digest, signature, `independent: true` or
successful health claim is synthesized. CLI exit zero means the observation was
collected, not that promotion is authorized.

The CLI can collect evidence for a later trusted promotion producer, but its JSON
must not be accepted as authenticated merely because it matches this schema. A
saved receipt may be modified or replayed. A trusted consumer must invoke the
observer itself and bind fresh output alongside the triggering Verify publication,
current owner/authority decision, independent capability health and target
deployment evidence. The run source recorded here is the promotion workflow's
source; this adapter does not validate the triggering Verify relationship or grant
source/traffic authority. It does not wire new production mutation gates or close
#663. Cryptographic substrate attestation, present-authority narrowing at mutation,
post-mutation Cloudflare identity reconciliation and live negative acceptance
remain outstanding.

API reference: [GitHub workflow jobs REST API](https://docs.github.com/en/rest/actions/workflow-jobs).
