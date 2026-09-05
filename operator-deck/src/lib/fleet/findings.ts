import type { GithubSnapshot } from "./types";

export type FindingSeverity = "p0" | "p1" | "p2" | "ok";

export type ReviewFinding = {
  id: string;
  severity: FindingSeverity;
  title: string;
  detail: string;
  owner: string;
};

export const REVIEW_FINDINGS: ReviewFinding[] = [
  {
    id: "specialist-runtime",
    severity: "p0",
    title: "Specialists exist as Copilot profiles, not live workers",
    detail:
      "Coordinator, Relay, Assurance, and Experience are markdown agent files. They do not lease isolated runtime cells. One supervisor plus the conversation plane still absorb every directive, which is why a single stalled Codex lane feels like Mahoraga is stuck.",
    owner: "coordinator",
  },
  {
    id: "realtime-gap",
    severity: "p1",
    title: "Live work is no longer GitHub-only — this deck runs inspect and owner writes",
    detail:
      "Inspect, isolate, scout, posture, cycle pulse, workflow reads, and owner GitHub writes (merge when CLEAN, comment, close, dispatch, eligible deletes) now execute here. Loopback CLI, Destiny fire, and Windows 7.0 activation still return a receipt instead of hiding.",
    owner: "admin",
  },
  {
    id: "token-boundary",
    severity: "ok",
    title: "Zero-credit routing contract is already correct",
    detail:
      "Idle health, CI, mailbox polls, and Destiny validation never invoke a model. The miss is using that same deterministic path for internet reads and issue isolation instead of waiting on Copilot or Cloud Pro.",
    owner: "assurance",
  },
  {
    id: "credit-free-protocol-graph",
    severity: "ok",
    title: "Zero-codex conversation now runs a local protocol graph",
    detail:
      "Paired-runtime Act no longer 409s for want of Codex. Observe-decide-act-verify-repair-report leases repository, local-core, and self-healer at $0. Hybrid chat still uses the Codex debate DAG. Paid fallback remains forbidden.",
    owner: "assurance",
  },
  {
    id: "tunnel-posture",
    severity: "ok",
    title: "No inbound tunnels — keep it that way",
    detail:
      "Control API is loopback-only. Destiny and Secondary runners are outbound. Cloudflare relay is ciphertext, not a hole into the Chromebook. This console continues that rule: outbound HTTPS to an allowlist, never ngrok, cloudflared, or reverse SSH.",
    owner: "relay",
  },
  {
    id: "write-token",
    severity: "ok",
    title: "Owner GitHub writes run on this deck",
    detail:
      "The connected gh session is the write plane. Merge still refuses unless mergeStateStatus is CLEAN (exact-head Verify). Wave A deletes preview first and skip anything ahead of main. Destiny spend and Windows 7.0 activate stay denied. Deployed Vercel has no token unless you add one — fail closed.",
    owner: "admin",
  },
  {
    id: "cycle-filename",
    severity: "p2",
    title: "Four-hour cycle still lives in an eight-hour filename",
    detail:
      ".github/workflows/sovereign-eight-hour-cycle.yml is named Sovereign Four Hour Candidate Cycle. Heartbeats fire at minute 7/22/37/52 every hour. The 4-hour window is software (tags), not cron. Rename or the next operator will misread the cadence.",
    owner: "repair",
  },
  {
    id: "cycle-self-update",
    severity: "p1",
    title: "Self-update produces a PR, it does not activate Windows",
    detail:
      "Producer smoke on 2026-09-04 19:29Z returned candidate-ready and opened PR #97 (scan report, github-actions). PR #98 (integration dispatch gap) is still open and merge-blocked. The cycle does not merge, does not workflow_dispatch Autonomous Integration, and does not activate 7.0.0-alpha.1 on the live 3.6.0 Windows runtime. Scheduled greens after 19:39Z skipped the worker because window 0 is already tagged complete.",
    owner: "repair",
  },
  {
    id: "issue-isolation",
    severity: "p1",
    title: "Open issues share one backlog instead of owner cells",
    detail:
      "Open issues mix settings work, Destiny trust, cleanup ledgers, and stale Codex tasks. Assigning each to a specialist with a path fence stops one blocked lane from freezing the fleet.",
    owner: "coordinator",
  },
  {
    id: "internet-scout",
    severity: "ok",
    title: "Scout is live on the allowlist",
    detail:
      "This deck GETs approved public hosts with no tokens, then hands bounded evidence to whoever needs it. Off-list hosts, private IPs, and inbound tunnels stay denied.",
    owner: "scout",
  },
  {
    id: "alpha-not-production",
    severity: "p2",
    title: "7.0.0-alpha.1 is not the live Windows runtime",
    detail:
      "Repository candidate is 7.0.0-alpha.1. Last verified production rollback remains 3.6.0. Docs correctly refuse to claim the Windows PID. This console talks to public GitHub, not your device.",
    owner: "assurance",
  },
];

export const UPGRADE_STEPS = [
  {
    title: "Keep Mahoraga as the control plane, not the worker",
    body: "The supervisor stays the lease and heartbeat owner. Specialists execute. Coordinator only allocates. That is already in AGENTS.md — it was never a live runtime.",
  },
  {
    title: "Deterministic first, model last",
    body: "Route, fetch, inspect, isolate, and deny with zero tokens. Spend a model only when the operator explicitly selects Cloud Pro or a signed Destiny envelope.",
  },
  {
    title: "Outbound connections only",
    body: "GitHub events, HTTPS allowlist, encrypted relay pairing. If a request needs inbound reachability to a device, Assurance denies it and prints the safer GitHub-App alternative.",
  },
  {
    title: "One issue, one cell, one owner",
    body: "Path fence, fencing token, content-free receipt. A Destiny stall cannot block a repo inspect. A Copilot 403 cannot block Scout.",
  },
];

export function liveFindings(snapshot: GithubSnapshot | null): ReviewFinding[] {
  if (!snapshot?.ok) {
    return [
      {
        id: "live-github",
        severity: "p1",
        title: "GitHub snapshot not loaded",
        detail: snapshot?.error
          ? `Public GitHub did not answer (${snapshot.error}). Isolation stays local until Admin can read.`
          : "Dispatch inspect on the deck to pull public metadata. No model fallback.",
        owner: "admin",
      },
    ];
  }

  const open78 = snapshot.issues.some((issue) => issue.number === 78);
  const open85 = snapshot.issues.some((issue) => issue.number === 85);
  const open87 = snapshot.issues.some((issue) => issue.number === 87);
  const cycle = snapshot.cycle;
  const candidateOpen = Boolean(
    cycle?.candidatePr || snapshot.openPulls.some((pull) => pull.number === 97 || pull.number === 99),
  );
  const gapOpen = Boolean(cycle?.integrationPr || snapshot.openPulls.some((pull) => pull.number === 98));

  const findings: ReviewFinding[] = [
    {
      id: "live-head",
      severity: "ok",
      title: `Live ${snapshot.fullName} @ ${snapshot.headSha.slice(0, 12) || "unknown"}`,
      detail: `${snapshot.headMessage || "No head message"}. ${snapshot.openIssues} open issues, ${snapshot.openPrs} open pulls. Visibility ${snapshot.visibility}.`,
      owner: "repository",
    },
  ];

  if (cycle) {
    findings.push({
      id: "live-cycle",
      severity: cycle.lastConclusion === "failure" ? "p0" : gapOpen ? "p1" : "ok",
      title: `Four-hour cycle · last ${cycle.lastEvent} #${cycle.lastRunNumber ?? "—"} ${cycle.lastConclusion}`,
      detail: [
        `Cron heartbeats 4×/hour; window is 4 hours from ${cycle.anchorUtc ?? "no anchor"}.`,
        cycle.nextWindowUtc ? `Next eligible window ${cycle.nextWindowUtc}.` : "",
        `Last run #${cycle.lastRunNumber ?? "—"} ${cycle.lastEvent} ${cycle.lastConclusion}.`,
        cycle.lastSuccessNumber
          ? `Last success #${cycle.lastSuccessNumber} ${cycle.lastSuccessEvent} at ${cycle.lastSuccessAt || "n/a"}.`
          : `Last schedule ${cycle.lastScheduleConclusion} at ${cycle.lastScheduleAt || "n/a"}.`,
        cycle.skippedStreak > 0
          ? `${cycle.skippedStreak} trailing skipped workflow_run pulses — those are other completions, not 4hr work.`
          : "",
        cycle.smokeComplete
          ? "Producer smoke tagged complete and opened a candidate (PR #97, scan report) — not a Windows activation."
          : "Producer smoke has not tagged complete.",
        gapOpen
          ? "PR #98 (integration dispatch gap) is still open, so a produced candidate is not guaranteed to merge."
          : "No open integration-gap PR on this snapshot.",
        "Scheduled green often means the worker was skipped because the current window is already tagged complete.",
      ]
        .filter(Boolean)
        .join(" "),
      owner: "repair",
    });
  }

  findings.push(
    {
      id: "live-78",
      severity: open78 ? "p1" : "ok",
      title: open78
        ? "Issue #78 is still open — Protect main is already settings-enforced"
        : "Issue #78 is closed or not in the open set",
      detail: open78
        ? "Ruleset 22284961 (Protect main) is active with required Verify checks. The settings write is done. Close #78 from the write plane after posting evidence."
        : "Main-protection issue is not currently open on the public snapshot.",
      owner: "admin",
    },
    {
      id: "live-85",
      severity: open85 ? "p1" : "ok",
      title: open85 ? "Issue #85 — Destiny trust still unconfigured" : "Destiny trust issue is not open",
      detail: open85
        ? "Independent actor receipts exist, but receiptTrust.mode remains unconfigured. New model-backed Destiny dispatches correctly refuse to fire."
        : "No open Destiny-trust issue on the current snapshot.",
      owner: "relay",
    },
    {
      id: "live-87",
      severity: open87 ? "p1" : "ok",
      title: open87 ? "Issue #87 — adaptive starters still open" : "Adaptive-starter issue is not open",
      detail: open87
        ? "Desktop lane: three composer-only starters in the Vercel workspace. Fill, do not submit. This fleet already adapts its own starters from the live issue set."
        : "No open adaptive-starter issue on the current snapshot.",
      owner: "coordinator",
    },
    {
      id: "live-candidate",
      severity: candidateOpen ? "p1" : "ok",
      title: candidateOpen ? "Sovereign candidate PR is open — not merged, not activated" : "No open sovereign candidate PR",
      detail: candidateOpen
        ? "Treat #97/#99 as evidence the producer can write a branch. Merge still needs exact-head Verify. This deck will squash only when mergeStateStatus is CLEAN."
        : "No candidate PR in the current open set.",
      owner: "repair",
    },
  );

  return findings;
}
