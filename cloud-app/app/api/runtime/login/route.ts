import { establishOwnerLoginSession, gatewayFailure } from "@/lib/cloud-owner-gateway";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const session = establishOwnerLoginSession(request, body?.ownerSecret);
    const response = Response.json({ authenticated: true }, { status: 200 });
    if (session.cookie) response.headers.set("set-cookie", session.cookie);
    response.headers.set("cache-control", "no-store");
    return response;
  } catch (error) {
    const failure = gatewayFailure(error);
    return Response.json({ authenticated: false, error: failure.code }, { status: failure.status, headers: { "cache-control": "no-store" } });
  }
}
