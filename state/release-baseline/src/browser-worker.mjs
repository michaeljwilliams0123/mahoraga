export async function executeBrowserCapability(capability) {
  if (capability !== "browser.status") throw new Error("unsupported-capability");
  return {
    verified: true,
    summary: "Local browser execution is retired. Interactive browsing requires a separately admitted approval-gated isolated cloud browser capability; the Railway workspace is not a canonical route.",
    executionPlane: "cloud-workspace",
    localLaunchAttempted: false,
    localExtensionRequired: false,
    interactionCapability: "cloud-browser-tool",
  };
}

export function shutdownBrowser() {}
