import { gatewayFailure } from "@/lib/cloud-owner-gateway";
import { dispatchCloudRuntimeAction } from "@/lib/cloud-runtime-action";
import { assertPagesBridgeActionPayload, authorizePagesBridgeMutation } from "@/lib/pages-owner-bridge";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    authorizePagesBridgeMutation(request);
    const value = await request.json().catch(() => ({}));
    if (!value || typeof value !== "object" || Array.isArray(value)) throw routeError("cloud-action-not-allowed", 400);
    const record = value as Record<string, unknown>;
    const payload = record.payload && typeof record.payload === "object" && !Array.isArray(record.payload) ? record.payload as Record<string, unknown> : {};
    assertPagesBridgeActionPayload(payload);
    const result = await dispatchCloudRuntimeAction(String(record.type ?? ""), payload);
    return Response.json(result.body, { status: result.status, headers: { "cache-control": "no-store" } });
  } catch (error) {
    const failure = gatewayFailure(error);
    return Response.json({ error: failure.code }, { status: failure.status, headers: { "cache-control": "no-store" } });
  }
}
function routeError(code: string, status: number) { return Object.assign(new Error(code), { status }); }
