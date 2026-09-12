import { coreRequest } from "@/lib/cloud-owner-gateway";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const gitSha = process.env.RAILWAY_GIT_COMMIT_SHA?.trim() ?? "";
  const expectedGitSha = process.env.MAHORAGA_EXPECTED_GIT_SHA?.trim() ?? "";
  if (process.env.NODE_ENV === "production") {
    if (!validSha(gitSha) || !validSha(expectedGitSha)) {
      return Response.json({ ok: false, state: "degraded", error: "deployment-provenance-missing", gitSha: gitSha || null, modelInvocations: 0 }, { status: 503, headers: { "cache-control": "no-store" } });
    }
    if (gitSha !== expectedGitSha) {
      return Response.json({ ok: false, state: "degraded", error: "deployment-provenance-mismatch", gitSha, modelInvocations: 0 }, { status: 503, headers: { "cache-control": "no-store" } });
    }
  }
  try {
    const response = await coreRequest("status");
    return Response.json({ ok: response.ok, state: response.ok ? "ready" : "degraded", gitSha: gitSha || null, modelInvocations: 0 }, { status: response.ok ? 200 : 503, headers: { "cache-control": "no-store" } });
  } catch {
    return Response.json({ ok: false, state: "offline", gitSha: gitSha || null, modelInvocations: 0 }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}

function validSha(value: string) { return /^[a-f0-9]{40}$/.test(value); }
