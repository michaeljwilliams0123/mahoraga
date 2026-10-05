export type GithubReadState = "available" | "denied" | "unavailable";
export type GithubWorkflowRun = {
  id: number; name: string; status: string; conclusion: string | null;
  sha: string | null; branch: string | null; url: string; updatedAt: string | null;
};
export type GithubWorkspaceSnapshot = {
  repository: "michaeljwilliams0123/mahoraga";
  observedAt: string;
  readOnly: true;
  pages: { state: GithubReadState; url: string | null; status: string | null; buildType: string | null; reason: string | null };
  actions: { state: GithubReadState; runs: GithubWorkflowRun[]; failedRunId: number | null; failedJobs: Array<{ name: string; steps: string[] }>; reason: string | null; failureDetailsReason: string | null };
};

