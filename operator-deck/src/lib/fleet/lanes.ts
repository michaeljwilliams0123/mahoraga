export type IssueLane = {
  fence: string;
  next: string;
};

export const ISSUE_LANES: Record<number, IssueLane> = {
  98: {
    fence: ".github/workflows · src/autonomous-integration.mjs",
    next: "Cycle can open a candidate PR. Integration dispatch is still gapped — do not treat #97 as merged.",
  },
  99: {
    fence: "sovereign scan report · feature/sovereign-*",
    next: "Second producer-smoke candidate. Same as #97: not a merge, not Windows activation.",
  },
  97: {
    fence: "sovereign scan report · feature/sovereign-*",
    next: "Producer-smoke candidate. A scan report is not Windows activation and not a production fix.",
  },
  87: {
    fence: "cloud-app/components/workspace.tsx · cloud-app/app/globals.css",
    next: "Composer-only starters. Fill, do not submit, route, or select Cloud Pro.",
  },
  85: {
    fence: "docs/DESTINY-CODEX-RELAY.md · coordination/destiny-dispatches/",
    next: "Owner configures receiptTrust.mode. Fleet will not fire Destiny from here.",
  },
  78: {
    fence: "GitHub branch protection (settings, not files)",
    next: "Ruleset 22284961 Protect main is active. Inspect, comment, then close #78.",
  },
  83: {
    fence: "contained-branch deletion + reconciliation ledger",
    next: "Preview first. Delete only ahead_by=0 with no open PR. Never main.",
  },
  54: {
    fence: "evaluation / bounded answer quality",
    next: "Repository cell. Wait on Codex; do not block Admin or Scout.",
  },
  51: {
    fence: "docs/UPDATE-CHANNEL.md",
    next: "Self-update is a candidate PR. Merge still requires exact-head Verify. 3.6.0 remains Windows rollback.",
  },
  36: {
    fence: "evaluation / bounded answer quality",
    next: "Independent cloud review. Isolate so a stall cannot freeze the fleet.",
  },
  35: {
    fence: "evaluation / bounded answer quality",
    next: "Codex queued. Isolate; no credit-spending retry.",
  },
  33: {
    fence: "runner device-identity contract",
    next: "Copilot-ready path. No inbound tunnel to obtain a device identity.",
  },
  32: {
    fence: "relay / Protocol 3.0.1 store",
    next: "Durable outbound pairing store. No public local listener.",
  },
  31: {
    fence: "private PWA gateway contract",
    next: "Copilot-ready path. Gateway stays private.",
  },
};

export function laneFor(number: number, title: string): IssueLane {
  return (
    ISSUE_LANES[number] ?? {
      fence: `issue/${number}`,
      next: `Owner cell for “${title.slice(0, 72)}”. No model. No device tunnel.`,
    }
  );
}
