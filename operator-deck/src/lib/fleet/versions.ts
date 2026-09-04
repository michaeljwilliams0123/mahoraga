export const LANGUAGE_LOCK = "TypeScript";
export const APP_HOST = "Vercel";
export const WORKSPACE_NOTE =
  "Google Workspace is identity, mail, and docs. It is not the app host. Browser UIs ship on Vercel.";
export const CLOUD_APP_URL = "https://mahoraga-cloud-workspace.vercel.app/";
export const REPO_URL = "https://github.com/michaeljwilliams0123/mahoraga";
export const PRODUCTION_SHA = "397acebf16766f44e3b4317f9d8b68b10de5f821";
export const CANDIDATE_VERSION = "7.0.0-alpha.1";
export const PRODUCTION_VERSION = "3.6.0";
export const DECK_VERSION = "fleet-1";

export type SurfaceId = "windows-rollback" | "conversation" | "operator-deck";

export type VersionSurface = {
  id: SurfaceId;
  label: string;
  version: string;
  role: string;
  host: string;
  language: string;
  status: string;
  href?: string;
};

export const VERSION_SURFACES: VersionSurface[] = [
  {
    id: "windows-rollback",
    label: "Windows production",
    version: PRODUCTION_VERSION,
    role: "Live rollback runtime. Loopback control API only.",
    host: "Loopback on the Windows host — this console cannot reach it",
    language: "Existing Node.js control plane. Do not rewrite to Java.",
    status: "Do not replace with 7.0. Activation from this deck is a hard deny.",
  },
  {
    id: "conversation",
    label: "Conversation workspace",
    version: CANDIDATE_VERSION,
    role: "GitHub candidate plus ChatGPT-style Cloud Pro workspace.",
    host: `${APP_HOST} · mahoraga-cloud-workspace`,
    language: "TypeScript (Next.js cloud-app)",
    status: "Not the Windows PID. Ordinary turns stay zero-codex unless Cloud Pro is selected.",
    href: CLOUD_APP_URL,
  },
  {
    id: "operator-deck",
    label: "Operator console",
    version: DECK_VERSION,
    role: "Singular operator UI: inspect, merge, comment, close, dispatch, delete.",
    host: `This ${APP_HOST}-hosted deck`,
    language: "TypeScript (TanStack Start). Locked — never Java unless you start a Java service.",
    status: "Owner GitHub writes through the connected gh session. Fail-closed without it.",
  },
];

export function versionReceipt(): string {
  return VERSION_SURFACES.map((surface) => `${surface.label} ${surface.version} — ${surface.role}`).join(" ");
}
