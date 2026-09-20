import { gatewayFailure, verifyOwnerLoginAttempt } from "@/lib/cloud-owner-gateway";
import { issuePagesBridgeSession } from "@/lib/pages-owner-bridge";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).some((key) => key !== "ownerPin")) throw routeError("cloud-owner-login-required", 400);
    const verified = verifyOwnerLoginAttempt(request, (body as { ownerPin?: unknown }).ownerPin);
    const session = issuePagesBridgeSession(verified.ownerId);
    return Response.json({ authenticated: true, bridgeSession: session.token, csrf: session.csrf, expiresAt: session.expiresAt, protocolVersion: session.protocolVersion }, { status: 200, headers: { "cache-control": "no-store" } });
  } catch (error) {
    const failure = gatewayFailure(error);
    const headers = new Headers({ "cache-control": "no-store" });
    if (failure.retryAfterSeconds > 0) headers.set("retry-after", String(failure.retryAfterSeconds));
    return Response.json({ authenticated: false, error: failure.code }, { status: failure.status, headers });
  }
}
function routeError(code: string, status: number) { return Object.assign(new Error(code), { status }); }
