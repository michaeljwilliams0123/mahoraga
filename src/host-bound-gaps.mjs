export const HOST_BOUND_GAPS = Object.freeze([
  Object.freeze({
    id: "vercel-duplicate-retirement",
    issue: 208,
    reason: "operator-cannot-see-canonical-or-duplicates",
    summary: "Vercel duplicate retirement is host-account work. A partial project list is not authority to create, pause, or delete projects.",
  }),
  Object.freeze({
    id: "destiny-work-phone-enrollment",
    issue: 238,
    reason: "destiny-phone-work-enrollment",
    summary: "Destiny Work binding must be enrolled from Destiny’s ChatGPT account. Owner GitHub operators cannot forge that lane.",
  }),
  Object.freeze({
    id: "windows-4783-canary",
    issue: 165,
    reason: "live-windows-canary",
    summary: "4783 candidate canary requires the live Windows host. Cloud operators must not touch 4782 or activate 7.0.0-alpha.2.",
  }),
  Object.freeze({
    id: "destiny-signed-identity",
    issue: 85,
    reason: "destiny-signed-receipt-unconfigured",
    summary: "Destiny signed identity stays fail-closed until an independent actor or Ed25519 receipt exists. Owner comments are not proof.",
  }),
  Object.freeze({
    id: "destiny-bind-probe-dormant",
    issue: 183,
    reason: "dormant-probe-do-not-fire",
    summary: "The Destiny Codex binding probe is intentionally dormant. Do not fire a model-backed probe to satisfy curiosity.",
  }),
  Object.freeze({
    id: "contained-branch-delete-ref",
    issue: 83,
    reason: "delete-ref-forbidden",
    summary: "Branch-cleanup ledger is closed as a contract. Live ref deletion remains forbidden on the credit-free operator.",
  }),
  Object.freeze({
    id: "destiny-codex-stale-base",
    issue: 244,
    reason: "stale-base-stop",
    summary: "Destiny Codex route hardening stops on a stale expected main HEAD. Do not rebase or guess.",
  }),
]);

export function classifyHostBoundGap({ issueNumber, title = "" } = {}) {
  const number = Number(issueNumber);
  const byIssue = HOST_BOUND_GAPS.find((gap) => gap.issue === number);
  if (byIssue) return hold(byIssue);

  const text = String(title ?? "").toLowerCase();
  const guessed = HOST_BOUND_GAPS.find((gap) => text.includes(gap.id.replaceAll("-", " ")));
  if (guessed) return hold(guessed);

  return Object.freeze({
    kind: "repo-closeable",
    hold: false,
    closeEligible: null,
    reason: "not-host-bound",
    issue: Number.isFinite(number) ? number : null,
    id: null,
    creditCost: 0,
    paidFallback: false,
    action: "inspect",
  });
}

export function nextCreditFreeIssueAction(issue = {}) {
  const classified = classifyHostBoundGap(issue);
  if (classified.hold === true) return classified;
  return Object.freeze({
    ...classified,
    action: "inspect",
  });
}

function hold(gap) {
  return Object.freeze({
    kind: "host-bound",
    hold: true,
    closeEligible: false,
    reason: gap.reason,
    issue: gap.issue,
    id: gap.id,
    summary: gap.summary,
    creditCost: 0,
    paidFallback: false,
    action: "hold-host-bound",
  });
}
