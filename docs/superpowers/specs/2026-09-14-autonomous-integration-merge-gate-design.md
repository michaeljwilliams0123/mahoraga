# Autonomous integration exact-check merge gate

## Purpose

Repair a false-negative in autonomous integration without weakening Mahoraga's protected-merge rules. The repair makes the merge decision use the repository's canonical required contexts when GitHub reports the aggregate pull-request state as `unstable`.

## Observed failure

On 2026-09-14, GitHub Actions evaluated PR #488 at exact head `d45283bfd909d415f443596c62c8ba5ab6fde4f1`. Both protected contexts, `Verify (ubuntu-latest)` and `Verify (windows-latest)`, completed successfully on that head. GitHub nevertheless reported `mergeable_state: "unstable"`. The trusted integration workflow classified every `unstable` state as `required-checks-failing`, so it failed before considering the exact required check records.

The live main-protection contract identifies only those two Verify contexts as required. A non-required skipped, pending, or failed check must not be reinterpreted as a failed protected context.

## Scope

The change is limited to:

- `src/autonomous-integration.mjs` merge-state classification and exact-head gate evaluation;
- `test/autonomous-integration.test.mjs` regression coverage.

No change will alter branch-protection configuration, required-context names, review policy, merge method, workflow permissions, direct-push restrictions, secrets, or Railway configuration.

## Design

The gate retains hard blocks for draft pull requests, merge conflicts, heads behind `main`, ineligible policy decisions, stale heads, and invalid data.

For `clean` and `has_hooks`, the gate remains ready as it is today. For `blocked`, `unknown`, or an absent mergeable state, it remains a hold and requires the exact-head evidence already implemented.

For `unstable`, the gate will no longer declare a failure solely from GitHub's aggregate label. It will inspect the latest exact-head records for each canonical required context:

- If both `Verify (ubuntu-latest)` and `Verify (windows-latest)` completed successfully on the authorized head, the gate is ready.
- If either required context is missing, incomplete, cancelled, skipped, or unsuccessful, the gate remains a hold with the missing-context evidence.

This is narrower than accepting `unstable` generally: a green result is possible only with current, named, exact-SHA evidence for every required protection context.

## Test plan

Add regression coverage that proves:

1. An eligible candidate with `unstable` state and exact-head success for both required Verify contexts is ready.
2. An eligible candidate with `unstable` state and a missing or failed required context remains held.
3. Existing blocks for conflicts, drafts, and stale or absent required evidence remain unchanged.

Run the focused autonomous-integration test module, `git diff --check`, and the repository verification suite appropriate to this protected-path change. The bootstrap pull request must obtain exact-head Ubuntu and Windows Verify success before it is considered for landing.

## Deployment and follow-up

This repair does not deploy application code. After it is safely integrated, re-run PR #488's exact-head verification so the trusted workflow can reevaluate the candidate. Once the desired source is on `main`, promote Railway only by setting its independent expected SHA to that exact commit, redeploying the canonical service, and verifying `/api/live` and `/api/ready` again.

## Safety properties

- GitHub's branch protections remain the source of merge authority.
- Exact-head validation remains mandatory; stale successful checks cannot satisfy the gate.
- The canonical two required contexts remain the only evidence that converts an `unstable` aggregate state to ready.
- No direct merge API call, force push, protection bypass, or production variable value is used by this repair.
