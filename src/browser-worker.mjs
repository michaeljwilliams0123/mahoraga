export async function executeBrowserCapability(capability) {
  if (capability !== "browser.status") throw new Error("unsupported-capability");
  return {
    verified: true,
    summary: "Local browser execution is retired. Interactive browsing is available only through the approval-gated isolated cloud browser in the unified Vercel workspace.",
    executionPlane: "cloud-workspace",
    localLaunchAttempted: false,
    localExtensionRequired: false,
    interactionCapability: "cloud-browser-tool",
  };
}

export function shutdownBrowser() {}
