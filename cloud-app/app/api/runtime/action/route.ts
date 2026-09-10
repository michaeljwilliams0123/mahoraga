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
  const allowed = new Set(["capabilities", "chat", "tasks", "messages", "message-content", "task-action", "operations-snapshot", "operations-action"]);
  if (!allowed.has(type)) throw Object.assign(new Error("cloud-action-not-allowed"), { status: 400 });
  return json(await coreRequest(type, payload));
}
async function json(response: Response) { return { status: response.status, body: await response.json().catch(() => ({ error: "cloud-core-response-invalid" })) }; }
