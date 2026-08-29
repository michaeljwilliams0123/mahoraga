import { connectionState, MODEL_ID, MODEL_LABEL } from "@/lib/runtime-config";

export const dynamic = "force-dynamic";

export async function GET() {
  const connections = connectionState();
  return Response.json(
    {
      ok: connections.model,
      model: { id: MODEL_ID, label: MODEL_LABEL, reasoning: "pro/max" },
      capabilities: {
        chat: connections.model,
        files: connections.model,
        datasetAnalysis: connections.model,
        webResearch: connections.model,
        browser: connections.browser,
        github: connections.github,
        gitlab: connections.gitlab,
      },
      boundaries: {
        executionPlane: "cloud",
        localExtensionRequired: false,
        localDeviceMutationAllowed: false,
      },
    },
    { headers: { "cache-control": "no-store" } },
  );
}
