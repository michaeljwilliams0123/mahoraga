import { cloudSessionCompatibility, coreRequest, establishOwnerSession, gatewayFailure } from "@/lib/cloud-owner-gateway";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const session = establishOwnerSession(request);
    const health = await coreRequest("status");
    const body = await health.json().catch(() => ({}));
    const connection = cloudSessionCompatibility(body, health.ok);
    const response = Response.json({ authenticated: true, state: connection.state === "ready" ? "Idle" : "Degraded", csrf: session.csrf, connection, runtime: body }, { status: connection.state === "ready" ? 200 : 503 });
    if (session.cookie) response.headers.set("set-cookie", session.cookie);
    response.headers.set("cache-control", "no-store");
    return response;
  } catch (error) { const failure = gatewayFailure(error); return Response.json({ authenticated: false, error: failure.code }, { status: failure.status }); }
}
