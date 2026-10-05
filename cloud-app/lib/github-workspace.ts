import type { GithubWorkspaceSnapshot } from "./github-workspace-types";
export type { GithubWorkspaceSnapshot } from "./github-workspace-types";

export type GithubWorkspaceLoad = { phase: "loading" } | { phase: "ready"; snapshot: GithubWorkspaceSnapshot } | { phase: "error"; reason: string };
export type GithubWorkspaceTransport = { nativeGithubWorkspace: () => Promise<GithubWorkspaceSnapshot> };

const nullableText = (value: unknown) => value === null || typeof value === "string";
const positiveId = (value: unknown) => typeof value === "number" && Number.isSafeInteger(value) && value > 0;

export function loadGithubWorkspace(transport: GithubWorkspaceTransport, onState: (state: GithubWorkspaceLoad) => void) {
  let active = true;
  onState({ phase: "loading" });
  void Promise.resolve().then(() => active ? transport.nativeGithubWorkspace() : null).then(snapshot => {
    if (!active) return;
    if (!snapshot || snapshot.repository !== "michaeljwilliams0123/mahoraga" || snapshot.readOnly !== true
      || !snapshot.pages || !snapshot.actions || !Array.isArray(snapshot.actions.runs) || !Array.isArray(snapshot.actions.failedJobs)
      || !["available", "denied", "unavailable"].includes(snapshot.pages.state)
      || !["available", "denied", "unavailable"].includes(snapshot.actions.state)
      || typeof snapshot.observedAt !== "string"
      || ![snapshot.pages.url, snapshot.pages.status, snapshot.pages.buildType, snapshot.pages.reason, snapshot.actions.reason, snapshot.actions.failureDetailsReason].every(nullableText)
      || !(snapshot.actions.failedRunId === null || positiveId(snapshot.actions.failedRunId))
      || !snapshot.actions.runs.every(run => run && positiveId(run.id) && typeof run.name === "string" && typeof run.status === "string"
        && typeof run.url === "string" && [run.conclusion, run.sha, run.branch, run.updatedAt].every(nullableText))
      || !snapshot.actions.failedJobs.every(job => job && typeof job.name === "string" && Array.isArray(job.steps) && job.steps.every(step => typeof step === "string"))) throw new Error("github-native-workspace-response-invalid");
    onState({ phase: "ready", snapshot });
  }).catch(error => {
    if (!active) return;
    const code = error instanceof Error ? error.message : "";
    onState({ phase: "error", reason: /^github-native-[a-z0-9-]{1,64}$/.test(code) ? code : "github-native-workspace-unavailable" });
  });
  return () => { active = false; };
}
