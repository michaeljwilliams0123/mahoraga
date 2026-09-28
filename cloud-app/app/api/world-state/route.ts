import { coreRequest } from "@/lib/cloud-owner-gateway";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const response = await coreRequest("world-state");
    const body = await response.json().catch(() => ({ error: "world-state-json-invalid" }));
    return Response.json(body, { status: response.ok ? 200 : response.status, headers: { "cache-control": "no-store" } });
  } catch {
    return Response.json({ error: "world-state-unavailable" }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}
