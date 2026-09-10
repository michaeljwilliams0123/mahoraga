import { authorizeOwnerMutation, coreRequest, gatewayFailure } from "@/lib/cloud-owner-gateway";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    authorizeOwnerMutation(request);
    const value = await request.json();
    const result = await dispatch(String(value?.type ?? ""), value?.payload ?? {});
    return Response.json(result.body, { status: result.status, headers: { "cache-control": "no-store" } });
  } catch (error) { const failure = gatewayFailure(error); return Response.json({ error: failure.code }, { status: failure.status }); }
}

async function dispatch(type: string, payload: Record<string, unknown>) {
  if (type === "capabilities") return json(await coreRequest("/api/v2/capabilities"));
  if (type === "chat") return json(await coreRequest("/api/chat", post(payload)));
  if (type === "tasks") { const result = await json(await coreRequest("/api/tasks")); return { status: result.status, body: { tasks: Array.isArray(result.body.tasks) ? result.body.tasks.filter((task: { conversationId?: unknown }) => task.conversationId === payload.conversationId) : [] } }; }
  if (type === "messages") return json(await coreRequest(`/api/conversations/${identifier(payload.conversationId, "con")}/messages`));
  if (type === "message-content") {
    const reference = typeof payload.contentReference === "string" && /^vault:[a-f0-9-]{36}$/.test(payload.contentReference) ? payload.contentReference : null;
    if (!reference) throw Object.assign(new Error("cloud-content-reference-invalid"), { status: 400 });
    const query = new URLSearchParams({ ownerType: "message", ownerId: identifier(payload.messageId, "msg"), classification: String(payload.classification ?? "local-only") });
    const response = await coreRequest(`/api/content/${reference}?${query}`);
    return { status: response.status, body: response.ok ? { content: await response.text() } : { error: "cloud-content-unavailable" } };
  }
  if (type === "task-action") return json(await coreRequest(`/api/tasks/${identifier(payload.taskId, "mhg")}/${payload.action === "retry" ? "retry" : payload.action === "cancel" ? "cancel" : "invalid"}`, post({})));
  if (type === "operations-snapshot") return json(await coreRequest("/api/operations"));
  if (type === "operations-action") return json(await coreRequest("/api/operations/action", post(payload)));
  throw Object.assign(new Error("cloud-action-not-allowed"), { status: 400 });
}
function post(body: unknown): RequestInit { return { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }; }
async function json(response: Response) { return { status: response.status, body: await response.json().catch(() => ({ error: "cloud-core-response-invalid" })) }; }
function identifier(value: unknown, prefix: string) { if (typeof value !== "string" || !new RegExp(`^${prefix}-[a-f0-9-]+$`).test(value)) throw Object.assign(new Error("cloud-action-identifier-invalid"), { status: 400 }); return value; }
