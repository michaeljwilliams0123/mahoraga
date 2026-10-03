export const PAGES_FRAME_CONTRACT_SURFACE = Object.freeze({
  protocolVersion: 1,
  actionFields: Object.freeze(["protocolVersion", "requestId", "type", "action", "payload"] as const),
  bodyCapBytes: 32 * 1024,
  abortDeadlineMs: 60_000,
  authError: "cloud-owner-auth-required",
  sourcePath: "deploy/cloudflare-owner-gateway/bridge-frame.ts",
  clientPath: "cloud-app/lib/pages-owner-bridge-client.ts",
  replayAllowed: false,
  trafficAuthority: false,
} as const);

export function pagesFrameContractDetail() {
  const bodyCapKiB = PAGES_FRAME_CONTRACT_SURFACE.bodyCapBytes / 1024;
  const abortSeconds = PAGES_FRAME_CONTRACT_SURFACE.abortDeadlineMs / 1000;
  return [
    `protocol v${PAGES_FRAME_CONTRACT_SURFACE.protocolVersion}`,
    `exact action fields: ${PAGES_FRAME_CONTRACT_SURFACE.actionFields.join(", ")}`,
    `${bodyCapKiB} KiB serialized action-body cap`,
    `${abortSeconds}-second abort`,
    "no replay",
    "HTTP 401/403 clears frame authentication",
    PAGES_FRAME_CONTRACT_SURFACE.authError,
    "parent origin/source checks remain",
    "observational only—not a private owner-browser transaction or traffic authority",
  ].join(" · ");
}
