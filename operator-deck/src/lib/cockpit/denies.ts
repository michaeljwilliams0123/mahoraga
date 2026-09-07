/** ECOSYSTEM-LOCK / operator-deck hard denies for cockpit helpers. */

export const HARD_DENIES = Object.freeze({
  googleOAuthOnConsole: "Google OAuth on the operator console is a hard deny.",
  inboundTunnels: "Inbound tunnels (ngrok, cloudflared, reverse SSH) are a hard deny.",
  destinySpend: "Destiny fire / Cloud Pro spend from this console is a hard deny.",
  windowsAlphaActivate: "Activating 7.0 alpha on Windows from this console is a hard deny.",
  browserFleetAuthority: "Browser GitHub write authority via fleet *.server.ts is a hard deny — use paired-core Operations.",
  nextPublicLoopback: "Baking 127.0.0.1 / loopback into NEXT_PUBLIC_* is a hard deny.",
  fakeRollbackApi: "Fake rollback APIs that are not core-mediated are a hard deny.",
  tokenRender: "Rendering tokens or secrets in the UI is a hard deny.",
} as const);

export type HardDenyKey = keyof typeof HARD_DENIES;

export function isHardDenyIntent(intentKind: string): HardDenyKey | null {
  switch (intentKind) {
    case "browser-github-write":
      return "browserFleetAuthority";
    case "google-oauth":
      return "googleOAuthOnConsole";
    case "inbound-tunnel":
      return "inboundTunnels";
    case "destiny-spend":
    case "cloud-pro-spend":
      return "destinySpend";
    case "windows-alpha-activate":
      return "windowsAlphaActivate";
    case "next-public-loopback":
      return "nextPublicLoopback";
    case "fake-rollback":
      return "fakeRollbackApi";
    case "render-token":
      return "tokenRender";
    default:
      return null;
  }
}
