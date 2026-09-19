export const LANGUAGE_LOCK = "TypeScript";
export const APP_HOST = "GitHub Pages";
export const WORKSPACE_NOTE =
  "GitHub Pages is the canonical browser presentation. GitHub remains source/build/release authority. Conversation and action execution use the encrypted relay; Railway remains the current server-capable runtime during migration.";
export const CLOUD_APP_URL = "https://michaeljwilliams0123.github.io/mahoraga/";
export const REPO_URL = "https://github.com/michaeljwilliams0123/mahoraga";
export const ROLLBACK_SHA = "397acebf16766f44e3b4317f9d8b68b10de5f821";
export const CANDIDATE_VERSION = "7.0.0-alpha.2";
export const ROLLBACK_VERSION = "3.6.0";
export const DECK_VERSION = "fleet-1";

export const REQUIRED_VERIFY_CONTEXTS = [
  "Verify (ubuntu-latest)",
  "Verify (windows-latest)",
] as const;

export const OPTIONAL_VERIFY_CONTEXTS = [] as const;

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
    label: "Windows rollback predecessor",
    version: ROLLBACK_VERSION,
    role: "Protected rollback predecessor. Current live runtime requires fresh host evidence.",
    host: "Loopback on the Windows host — this console cannot reach it",
    language: "Existing Node.js control plane. Do not rewrite to Java.",
    status: "Do not infer active Windows production from this ledger. Activation from this deck is a hard deny.",
  },
  {
    id: "conversation",
    label: "Conversation workspace",
    version: CANDIDATE_VERSION,
    role: "GitHub candidate plus ChatGPT-style workspace with self.evolve control plane.",
    host: `${APP_HOST} canonical browser presentation · cloud-app/ static export`,
    language: "TypeScript (Next.js cloud-app)",
    status: "Not the Windows PID. Ordinary turns stay zero-codex unless Cloud Pro is selected. Owner directives may target self.evolve.",
    href: CLOUD_APP_URL,
  },
  {
    id: "operator-deck",
    label: "Operator console",
    version: DECK_VERSION,
    role: "Reference/control library for unified cloud-app operator capabilities.",
    host: "Non-deployable reference/control library; operator surface lives in cloud-app/.",
    language: "TypeScript (TanStack Start). Locked — never Java unless you start a Java service.",
    status: "Owner GitHub writes through the connected gh session. Fail-closed without it.",
  },
];

export function versionReceipt(): string {
  return VERSION_SURFACES.map((surface) => `${surface.label} ${surface.version} — ${surface.role}`).join(" ");
}
