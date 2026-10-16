import type { BrokerBinding, BrokerEnv } from "./worker.ts";

const PROVIDER_BINDING: Readonly<Record<string, keyof BrokerEnv>> = Object.freeze({
  github: "REPOSITORY_PROVIDER",
  repository: "REPOSITORY_PROVIDER",
  cloudflare: "CLOUD_PROVIDER",
  integration: "INTEGRATION_PROVIDER",
  browser: "BROWSER_PROVIDER",
  desktop: "DESKTOP_PROVIDER",
  codex: "CODEX_PROVIDER",
  memory: "MEMORY_PROVIDER",
  artifact: "ARTIFACT_PROVIDER",
  image: "IMAGE_PROVIDER",
  workspace: "WORKSPACE_PROVIDER",
});

export function providerBinding(env: BrokerEnv, provider: string): BrokerBinding | undefined {
  const key = PROVIDER_BINDING[provider];
  return key ? env[key] as BrokerBinding | undefined : undefined;
}

export async function invokeProvider(binding: BrokerBinding, lease: Record<string, unknown>, payload: unknown, evidenceRefs: string[]) {
  try {
    const response = await binding.fetch(new Request("https://mahoraga-provider/api/execute", {
      method: "POST",
      headers: { "content-type":"application/json", accept:"application/json" },
      body: JSON.stringify({ lease, payload, evidenceRefs }),
    }));
    if (!response.ok) return { status:"failed" as const, error:"worker-execution-failed", httpStatus:response.status };
    const value: unknown = await response.json();
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return { status:"failed" as const, error:"worker-execution-failed", httpStatus:502 };
    }
    const result = value as Record<string, unknown>;
    if (result.status === "complete" && result.receipt && typeof result.receipt === "object") return result as { status:"complete"; receipt:Record<string,unknown> };
    if (result.status === "handoff" && result.handoff && typeof result.handoff === "object") return result as { status:"handoff"; handoff:Record<string,unknown> };
  } catch {
    // Transport loss or invalid content does not prove that execution never
    // committed. Preserve the caller's failed attempt; never retry here.
  }
  return { status:"failed" as const, error:"worker-execution-failed", httpStatus:502 };
}
