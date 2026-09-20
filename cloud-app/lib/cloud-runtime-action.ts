import { coreRequest } from "./cloud-owner-gateway";

export const ALLOWED_CLOUD_RUNTIME_ACTIONS = new Set([
  "capabilities",
  "chat",
  "tasks",
  "messages",
  "message-content",
  "task-action",
  "composio-github-repository",
  "operations-snapshot",
  "operations-action",
] as const);

type CloudRuntimeAction = typeof ALLOWED_CLOUD_RUNTIME_ACTIONS extends Set<infer T> ? T : never;

export async function dispatchCloudRuntimeAction(type: string, payload: Record<string, unknown>) {
  if (!ALLOWED_CLOUD_RUNTIME_ACTIONS.has(type as CloudRuntimeAction)) {
    throw Object.assign(new Error("cloud-action-not-allowed"), { status: 400 });
  }
  const response = await coreRequest(type, payload);
  return {
    status: response.status,
    body: await response.json().catch(() => ({ error: "cloud-core-response-invalid" })),
  };
}
