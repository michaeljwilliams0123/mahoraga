export const AGENT_IDS = [
  "coordinator",
  "scout",
  "admin",
  "assurance",
  "relay",
  "repository",
  "repair",
] as const;

export type AgentId = (typeof AGENT_IDS)[number];

export type CreditClass = "deterministic" | "zero-credit-local" | "explicit-model";

export type CellState =
  | "queued"
  | "leased"
  | "running"
  | "succeeded"
  | "failed"
  | "denied"
  | "waiting";

export type ConnectionKind = "outbound-https" | "loopback" | "github-event" | "denied-inbound";

export type IntentKind =
  | "repository-inspect"
  | "issue-isolate"
  | "issue-inspect"
  | "github-admin"
  | "web-scout"
  | "posture-audit"
  | "inbound-tunnel-denied"
  | "repair-isolate"
  | "health-scan"
  | "cycle-inspect"
  | "workflow-inspect"
  | "arsenal-list"
  | "loopback-denied"
  | "authority-denied"
  | "github-write"
  | "version-inspect"
  | "decompose";

export type CommandPlane = "live" | "write" | "github" | "loopback" | "denied";

export type WriteVerb =
  | "merge-pr"
  | "approve-pr"
  | "comment"
  | "close-issue"
  | "create-issue"
  | "dispatch-workflow"
  | "delete-preview"
  | "delete-branch"
  | "protect-inspect";

export type AgentDefinition = {
  id: AgentId;
  label: string;
  mandate: string;
  owns: string;
  cannot: string;
  plane: ConnectionKind;
  credit: CreditClass;
};

export type Classification = {
  intent: IntentKind;
  reasonCode: string;
  credit: CreditClass;
  owner: AgentId;
  agents: AgentId[];
  allowHosts: string[];
  denyReasons: string[];
  targetUrl: string | null;
  issueNumber: number | null;
  workflowFile: string | null;
  cliHint: string | null;
  writeVerb: WriteVerb | null;
  writeBody: string | null;
};

export type FleetEvent = {
  at: string;
  agent: AgentId;
  kind: "lease" | "observe" | "deny" | "complete" | "wait" | "route";
  message: string;
};

export type EvidenceItem = {
  label: string;
  value: string;
  href?: string;
};

export type TaskCell = {
  id: string;
  title: string;
  intent: IntentKind;
  owner: AgentId;
  supporting: AgentId[];
  state: CellState;
  credit: CreditClass;
  fencingToken: number;
  requestHash: string;
  summary: string;
  evidence: EvidenceItem[];
  events: FleetEvent[];
  isolated: boolean;
  createdAt: string;
  completedAt: string | null;
  issueNumber?: number;
  pathFence?: string;
};

export type GithubIssueLite = {
  number: number;
  title: string;
  state: string;
  labels: string[];
  htmlUrl: string;
  updatedAt: string;
  assignedAgent: AgentId;
};

export type OpenPull = {
  number: number;
  title: string;
  htmlUrl: string;
  author: string;
};

export type WorkflowPulse = {
  name: string;
  path: string;
  state: string;
  htmlUrl: string;
};

export type CyclePulse = {
  workflow: string;
  htmlUrl: string;
  lastRunNumber: number | null;
  lastEvent: string;
  lastConclusion: string;
  lastAt: string;
  lastUrl: string;
  lastScheduleConclusion: string;
  lastScheduleAt: string;
  lastScheduleUrl: string;
  lastSuccessNumber: number | null;
  lastSuccessEvent: string;
  lastSuccessConclusion: string;
  lastSuccessAt: string;
  lastSuccessUrl: string;
  skippedStreak: number;
  anchorUtc: string | null;
  completeUtc: string | null;
  nextWindowUtc: string | null;
  currentWindowComplete: boolean;
  smokeComplete: boolean;
  candidatePr: OpenPull | null;
  integrationPr: OpenPull | null;
};

export type WriteStatus = {
  ok: boolean;
  login: string | null;
  rulesetName: string | null;
  rulesetEnforcement: string | null;
  requiredChecks: string[];
  error?: string;
};

export type GithubSnapshot = {
  fetchedAt: string;
  ok: boolean;
  error?: string;
  fullName: string;
  description: string;
  defaultBranch: string;
  pushedAt: string;
  openIssues: number;
  openPrs: number;
  headSha: string;
  headMessage: string;
  visibility: string;
  issues: GithubIssueLite[];
  openPulls: OpenPull[];
  workflows: WorkflowPulse[];
  cycle: CyclePulse | null;
  write: WriteStatus;
};

export type RepoContracts = {
  ok: boolean;
  error?: string;
  agentContract: string;
  readmeExcerpt: string;
  packageVersion: string;
  workerNames: string[];
};

export type GithubIssueDetail = GithubIssueLite & {
  ok: boolean;
  error?: string;
  bodyExcerpt: string;
};

export type WorkflowRunLite = {
  ok: boolean;
  error?: string;
  name: string;
  file: string;
  number: number | null;
  event: string;
  conclusion: string;
  status: string;
  createdAt: string;
  htmlUrl: string;
  headSha: string;
};

export type ExecuteResult = {
  cells: TaskCell[];
  snapshot?: GithubSnapshot;
};
