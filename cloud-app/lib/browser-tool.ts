import { tool } from "ai";
import { z } from "zod";
import { configuredDomains } from "@/lib/runtime-config";

const inputSchema = z.object({
  url: z.string().url().describe("The exact HTTPS URL to open."),
  instruction: z
    .string()
    .min(1)
    .max(1200)
    .describe("A bounded description of the browser interaction."),
  dataClass: z
    .enum(["synthetic", "personal"])
    .describe("The approved cloud data classification."),
});

function validateTarget(rawUrl: string) {
  const url = new URL(rawUrl);
  if (url.protocol !== "https:") throw new Error("browser-https-required");
  const domains = configuredDomains();
  if (!domains.some((domain) => url.hostname === domain || url.hostname.endsWith(`.${domain}`))) {
    throw new Error("browser-domain-not-allowed");
  }
  return url;
}

function validateProviderEndpoint(rawEndpoint: string) {
  const endpoint = new URL(rawEndpoint);
  if (endpoint.protocol !== "https:") throw new Error("cloud-browser-provider-https-required");
  if (endpoint.username || endpoint.password) throw new Error("cloud-browser-provider-auth-in-url-not-allowed");

  const allowedHosts = (process.env.BROWSER_PROVIDER_ALLOWED_HOSTS ?? "api.browser-provider.com")
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);

  if (!allowedHosts.includes(endpoint.hostname.toLowerCase())) {
    throw new Error("cloud-browser-provider-host-not-allowed");
  }

  return endpoint;
}

export const cloudBrowserTool = tool({
  description:
    "Run one bounded interaction in an isolated cloud browser. Never uses a local browser or extension. Every invocation requires human approval.",
  inputSchema,
  needsApproval: true,
  execute: async ({ url: rawUrl, instruction, dataClass }) => {
    const endpoint = process.env.BROWSER_PROVIDER_URL;
    const token = process.env.BROWSER_PROVIDER_TOKEN;
    if (!endpoint || !token) throw new Error("cloud-browser-not-configured");

    const providerUrl = validateProviderEndpoint(endpoint);
    const url = validateTarget(rawUrl);
    const response = await fetch(providerUrl.toString(), {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        url: url.toString(),
        instruction,
        dataClass,
        isolated: true,
        extensionsEnabled: false,
        localFileAccess: false,
      }),
      signal: AbortSignal.timeout(60_000),
      cache: "no-store",
    });

    if (!response.ok) throw new Error(`cloud-browser-provider-${response.status}`);
    const payload = (await response.json()) as {
      status?: unknown;
      summary?: unknown;
      finalUrl?: unknown;
    };

    return {
      status: typeof payload.status === "string" ? payload.status.slice(0, 80) : "completed",
      summary:
        typeof payload.summary === "string"
          ? payload.summary.slice(0, 4000)
          : "Cloud browser completed without a summary.",
      finalUrl:
        typeof payload.finalUrl === "string" ? payload.finalUrl.slice(0, 2048) : url.toString(),
      executionPlane: "cloud",
      localDeviceChanged: false,
    };
  },
});
