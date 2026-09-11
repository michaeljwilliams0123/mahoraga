import { previewCreditFreeHeartbeat } from "../fleet/heartbeat";
import { VERSION_SURFACES, versionReceipt, CLOUD_APP_URL, PRODUCTION_VERSION, CANDIDATE_VERSION } from "../fleet/versions";
import type { AdapterResult, CockpitPanelModel } from "./types";

/** Observational MESH | CLOUD | WORKSPACE panel models â€” no live GH writes. */

export function buildMeshPanel(input?: {
  meshReachable?: boolean | null;
  detail?: string | null;
}): AdapterResult<CockpitPanelModel> {
  const reachable = input?.meshReachable;
  const tone = reachable === true ? "steel" : reachable === false ? "warn" : "neutral";
  return {
    ok: true,
    value: {
      id: "mesh",
      title: "MESH",
      tone,
      summary:
        reachable === true
          ? "Mesh signal reported reachable (observational only)."
          : reachable === false
            ? "Mesh unreachable â€” L7 experiment is out of this production helper lane."
            : "Mesh panel is observational; production helpers do not drive L7 mesh src.",
      lines: [
        { label: "lane", value: "observational" },
        { label: "L7 mesh src", value: "out of bounds for Mahoraga.v2 helpers" },
        { label: "detail", value: String(input?.detail ?? "no-probe") },
      ],
      actionable: false,
    },
  };
}

export function buildCloudPanel(input?: {
  healthOk?: boolean | null;
  authority?: string | null;
}): AdapterResult<CockpitPanelModel> {
  const ok = input?.healthOk;
  return {
    ok: true,
    value: {
      id: "cloud",
      title: "CLOUD",
      tone: ok === true ? "ok" : ok === false ? "warn" : "neutral",
      summary: "Mahoraga cloud workspace - observational health only.",
      lines: [
        { label: "host", value: CLOUD_APP_URL },
        { label: "authority", value: String(input?.authority ?? "paired-mahoraga-core") },
        { label: "paidFallback", value: "false" },
        { label: "rollbackTarget", value: PRODUCTION_VERSION },
      ],
      actionable: false,
    },
  };
}

export function buildWorkspacePanel(input?: {
  coreReady?: boolean | null;
  healthOk?: boolean;
  healthStatus?: "healthy" | "degraded" | "unhealthy";
  planeOk?: boolean;
  planeReason?: string | null;
}): AdapterResult<CockpitPanelModel> {
  const heartbeat = previewCreditFreeHeartbeat({
    healthOk: input?.healthOk ?? false,
    healthStatus: input?.healthStatus ?? "unhealthy",
    planeOk: input?.planeOk ?? false,
    planeReason: input?.planeReason,
    inspectOnly: true,
  });
  const coreReady = input?.coreReady === true;
  return {
    ok: true,
    value: {
      id: "workspace",
      title: "WORKSPACE",
      tone: coreReady ? "ok" : "warn",
      summary: coreReady
        ? "Workspace shell expects paired core; Operations stay relay-mediated."
        : "Pair runtime before Operations â€” browser has no fleet write authority.",
      lines: [
        { label: "creditFreeNext", value: heartbeat.nextAction },
        { label: "destinyTrigger", value: heartbeat.destinyTrigger.status },
        { label: "receiptTrust", value: heartbeat.destinyTrigger.receiptTrustMode },
        { label: "surfaces", value: String(VERSION_SURFACES.length) },
        { label: "ledger", value: versionReceipt().slice(0, 160) },
      ],
      actionable: false,
    },
  };
}

export function buildAllPanels(input?: {
  meshReachable?: boolean | null;
  meshDetail?: string | null;
  healthOk?: boolean | null;
  authority?: string | null;
  coreReady?: boolean | null;
  healthStatus?: "healthy" | "degraded" | "unhealthy";
  planeOk?: boolean;
  planeReason?: string | null;
}): AdapterResult<CockpitPanelModel[]> {
  const mesh = buildMeshPanel({ meshReachable: input?.meshReachable, detail: input?.meshDetail });
  const cloud = buildCloudPanel({ healthOk: input?.healthOk, authority: input?.authority });
  const workspace = buildWorkspacePanel({
    coreReady: input?.coreReady,
    healthOk: input?.healthOk === true,
    healthStatus: input?.healthStatus,
    planeOk: input?.planeOk,
    planeReason: input?.planeReason,
  });
  if (!mesh.ok) return mesh;
  if (!cloud.ok) return cloud;
  if (!workspace.ok) return workspace;
  return { ok: true, value: [mesh.value, cloud.value, workspace.value] };
}
