export const dynamic = "force-dynamic";
export function GET() { return Response.json({ ok: true, state: "live", modelInvocations: 0 }, { headers: { "cache-control": "no-store" } }); }
