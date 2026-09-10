import { coreRequest, establishOwnerSession, gatewayFailure } from "@/lib/cloud-owner-gateway";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const session = establishOwnerSession(request);
    const health = await coreRequest("/api/status");
    const body = await health.json().catch(() => ({}));
    const response = Response.json({ authenticated: true, state: health.ok ? "Idle" : "Degraded", csrf: session.csrf, runtime: body }, { status: health.ok ? 200 : 503 });
    if (session.cookie) response.headers.set("set-cookie", session.cookie);
    response.headers.set("cache-control", "no-store");
    return response;
  } catch (error) { const failure = gatewayFailure(error); return Response.json({ authenticated: false, error: failure.code }, { status: failure.status }); }
}
