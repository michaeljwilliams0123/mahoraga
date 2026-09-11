export const dynamic = "force-dynamic";

export function GET() {
  return Response.json(
    {
      ok: true,
      state: "live",
      modelInvocations: 0,
      telemetry: {
        source: "cloud-app-process",
        scope: "liveness-only",
        runtimeState: "unknown",
        runtimeSource: "paired-core-required",
      },
    },
    { headers: { "cache-control": "no-store" } },
  );
}
