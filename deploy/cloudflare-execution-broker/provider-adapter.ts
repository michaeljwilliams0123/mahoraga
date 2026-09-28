import type { BrokerBinding, BrokerEnv } from "./worker.ts";

const PROVIDER_BINDING: Readonly<Record<string, keyof BrokerEnv>> = Object.freeze({
  github: "REPOSITORY_PROVIDER",
  repository: "REPOSITORY_PROVIDER",
  cloudflare: "CLOUD_PROVIDER",
  composio: "INTEGRATION_PROVIDER",
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
  const response = await binding.fetch(new Request("https://mahoraga-provider/api/execute", {
    method: "POST",
    headers: { "content-type":"application/json", accept:"application/json" },
    body: JSON.stringify({ lease, payload, evidenceRefs }),
  }));
  if (!response.ok) return { status:"failed" as const, error:"worker-execution-failed", httpStatus:response.status };
  const value = await response.json() as Record<string, unknown>;
  if (value.status === "complete" && value.receipt && typeof value.receipt === "object") return value as { status:"complete"; receipt:Record<string,unknown> };
  if (value.status === "handoff" && value.handoff && typeof value.handoff === "object") return value as { status:"handoff"; handoff:Record<string,unknown> };
  return { status:"failed" as const, error:"worker-execution-failed", httpStatus:502 };
}
