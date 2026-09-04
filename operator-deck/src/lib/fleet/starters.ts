import type { GithubSnapshot } from "./types";

export type Starter = {
  label: string;
  command: string;
  kind?: "run" | "palette";
};

const INSPECT: Starter = {
  label: "Inspect Mahoraga live",
  command: "Inspect the live Mahoraga repository: health, open issues, and current head.",
};

const CYCLE: Starter = {
  label: "Review 4hr cycle",
  command: "Inspect the four-hour sovereign candidate cycle, last GitHub run, and whether Mahoraga actually self-updated.",
};

const POSTURE: Starter = {
  label: "Audit connection posture",
  command: "Audit outbound-only connection posture. Deny inbound tunnels. Report relay and GitHub surfaces.",
};

const ARSENAL: Starter = {
  label: "All commands",
  command: "List the command arsenal and show what this deck can run live versus GitHub, loopback, or deny.",
};

const LEDGER: Starter = {
  label: "Version ledger",
  command: "Show the version ledger: live 3.6.0, candidate 7.0.0-alpha.1, and this operator deck.",
};

const PROTECT: Starter = {
  label: "Inspect main protection",
  command: "Inspect the Protect main GitHub ruleset and prove exact-head Verify is enforced.",
};

export function buildStarters(snapshot: GithubSnapshot | null): Starter[] {
  const issues = snapshot?.ok ? snapshot.issues : [];
  const isolate: Starter = {
    label: issues.length > 0 ? `Isolate ${issues.length} open issues` : "Isolate open issues",
    command: "List open GitHub issues and allocate each to an isolated specialist cell.",
  };

  return [INSPECT, CYCLE, LEDGER, isolate, PROTECT, POSTURE, ARSENAL];
}
