import { authorizeOwnerMutation, gatewayFailure } from "@/lib/cloud-owner-gateway";
import { dispatchCloudRuntimeAction } from "@/lib/cloud-runtime-action";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    authorizeOwnerMutation(request);
    const value = await request.json();
    const payload = isRecord(value?.payload) ? value.payload : {};
    const result = await dispatchCloudRuntimeAction(String(value?.type ?? ""), payload);
    return Response.json(result.body, { status: result.status, headers: { "cache-control": "no-store" } });
  } catch (error) { const failure = gatewayFailure(error); return Response.json({ error: failure.code }, { status: failure.status, headers: { "cache-control": "no-store" } }); }
}
function isRecord(value: unknown): value is Record<string, unknown> { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
