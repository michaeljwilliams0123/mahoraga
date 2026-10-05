export const SNIPPET_TEXT_CHAR_LIMIT = 3_500;

const TEXT_SNIPPET_NAME = /\.(?:txt|md|json|csv|log|yaml|yml|xml|ts|tsx|js|mjs|py|sql)$/i;

export type StagedHandling = "text-snippet" | "opaque-artifact";

export type SessionLane = "authenticated" | "connecting" | "access-required" | "recovery-available" | "unavailable";

export function stagedHandling(file: { name: string; type: string }): StagedHandling {
  if (file.type.startsWith("text/") || TEXT_SNIPPET_NAME.test(file.name)) return "text-snippet";
  return "opaque-artifact";
}

export function handlingLabel(kind: StagedHandling) {
  return kind === "text-snippet"
    ? `model-visible text snippet, truncated to ${SNIPPET_TEXT_CHAR_LIMIT.toLocaleString()} chars on send`
    : "opaque artifact, excluded from model context until an extraction receipt exists";
}

export function sessionLane(input: { coreReady: boolean; relayState: string; ownerLoginRequired: boolean }): SessionLane {
  if (input.coreReady) return "authenticated";
  if (input.ownerLoginRequired) return "access-required";
  if (input.relayState === "pairing") return "recovery-available";
  if (input.relayState === "resuming") return "connecting";
  return "unavailable";
}

export function sessionLaneLabel(lane: SessionLane) {
  switch (lane) {
    case "authenticated": return "Authenticated";
    case "connecting": return "Connecting";
    case "access-required": return "Access required";
    case "recovery-available": return "Recovery available";
    default: return "Unavailable";
  }
}
