export type RuntimeTruthStatus = "exact-live" | "source-ahead" | "deployment-failed" | "deployment-skipped" | "live-unreachable" | "unknown";

export type RuntimeTruthObservation = {
  sourceSha: string;
  deploymentSha: string | null;
  deploymentStatus: string | null;
  live: boolean;
  ready: boolean;
};

export type RuntimeTruth = {
  status: RuntimeTruthStatus;
  cognitionReady: boolean;
  sourceSha: string;
  deploymentSha: string | null;
  reason: string;
};

export function deriveRuntimeTruth(observation: RuntimeTruthObservation): RuntimeTruth {
  const base = { sourceSha: observation.sourceSha, deploymentSha: observation.deploymentSha };
  if (!observation.deploymentSha) return { ...base, status: "unknown", cognitionReady: false, reason: "deployment-sha-missing" };
  if (observation.deploymentStatus === "FAILED" || observation.deploymentStatus === "CRASHED") {
    return { ...base, status: "deployment-failed", cognitionReady: false, reason: `deployment-${observation.deploymentStatus.toLowerCase()}` };
  }
  if (observation.deploymentStatus === "SKIPPED") {
    return { ...base, status: "deployment-skipped", cognitionReady: false, reason: "deployment-skipped" };
  }
  if (observation.sourceSha !== observation.deploymentSha) {
    return { ...base, status: "source-ahead", cognitionReady: false, reason: "source-deployment-sha-mismatch" };
  }
  if (!observation.live || !observation.ready) {
    return { ...base, status: "live-unreachable", cognitionReady: false, reason: !observation.live ? "live-not-proven" : "ready-not-proven" };
  }
  if (observation.deploymentStatus !== "SUCCESS") {
    return { ...base, status: "unknown", cognitionReady: false, reason: "deployment-success-not-proven" };
  }
  return { ...base, status: "exact-live", cognitionReady: true, reason: "exact-source-deployment-live-ready" };
}
