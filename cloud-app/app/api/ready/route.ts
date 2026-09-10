import { coreRequest } from "@/lib/cloud-owner-gateway";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() { try { const response = await coreRequest("status"); return Response.json({ ok: response.ok, state: response.ok ? "ready" : "degraded", modelInvocations: 0 }, { status: response.ok ? 200 : 503, headers: { "cache-control": "no-store" } }); } catch { return Response.json({ ok: false, state: "offline", modelInvocations: 0 }, { status: 503 }); } }
