# Strengthening Monitor — Read-Only Gate Advisor (Spec)

> **Status: DESIGN DRAFT.** The monitor **reads** platform-native signals and posts an advisory
> risk summary at each promotion gate. It never approves, deploys, or grants anything — the human
> reviewer always presses Approve. Grounded in Microsoft Learn.

## Purpose

Make the reviewer's periodic check-in fast and informed: at each gate, the monitor surfaces a
one-glance "here's what I found" summary so promotion decisions are easy. Advisory only.

## Signals it reads (all native, all read-only)

1. **Solution Checker results** — static analysis with machine-readable `Severity`
   (Critical/High/Medium/Low/Informational) and `Category` (incl. Security). Flag any Critical/High
   Security finding. In managed environments, Critical violations can be enforced as blocking. [1]
   *Caveat surfaced to reviewer: checker success does not guarantee import success.* [1]
2. **Connection-reference & environment-variable readiness** — flag any empty `ConnectionId` or
   unset environment variable in the deployment settings JSON. [2]
3. **Automated test outcomes** — surface pass/fail from the pipeline's test step. [3]
4. **Run-history status** — surface any prior Failed/canceled deployment for the same solution. [4]
5. **Autonomy-safety flag** — if the target env enforces end-user credentials, warn that
   scheduled/background agent triggers will fail (they require a live user sign-in). [5]

## Output (advisory only)

A Markdown gate summary:
- ✅ / ⚠️ / 🛑 per signal above
- A plain-language "risks before you approve" list
- An explicit line: **"Advisory only — a human still presses Approve."**

## Hard non-goals

- ❌ Never approves or promotes. ❌ Never deploys. ❌ Never grants or changes permissions.
- ❌ Never writes to protected paths. ❌ Never handles secrets.

## Sources
[1] learn.microsoft.com/power-apps/maker/data-platform/use-powerapps-checker
[2] learn.microsoft.com/power-platform/alm/conn-ref-env-variables-build-tools
[3] learn.microsoft.com/microsoft-copilot-studio/guidance/kit-automate-test-deploy
[4] learn.microsoft.com/power-platform/alm/admin-deployment-hub
[5] learn.microsoft.com/microsoft-copilot-studio/configure-no-maker-authentication
