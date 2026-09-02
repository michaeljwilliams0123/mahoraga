import {
  CLOUD_MAX_CONTEXT_MESSAGES,
  CLOUD_MAX_CONTEXT_TEXT_CHARS,
  CLOUD_MAX_OUTPUT_TOKENS,
  CLOUD_MAX_STEPS,
  CLOUD_SEARCH_MAX_TOKENS,
  connectionState,
  MAX_INPUT_TEXT_CHARS,
  MODEL_ID,
  MODEL_LABEL,
} from "@/lib/runtime-config";

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
        githubTaskBridge: true,
        runtimeRelay: true,
      },
      boundaries: {
        executionPlane: "cloud-with-owner-paired-runtime",
        localExtensionRequired: false,
        localDeviceMutationAllowed: false,
        relaySeesPlaintext: false,
      },
      routing: {
        default: "zero-codex",
        automaticPaidFallback: false,
        cloudRequiresExplicitSelection: true,
      },
      cloudBudgets: {
        contextMessages: CLOUD_MAX_CONTEXT_MESSAGES,
        contextTextCharacters: CLOUD_MAX_CONTEXT_TEXT_CHARS,
        inputTextCharacters: MAX_INPUT_TEXT_CHARS,
        outputTokens: CLOUD_MAX_OUTPUT_TOKENS,
        toolSteps: CLOUD_MAX_STEPS,
        searchTokens: CLOUD_SEARCH_MAX_TOKENS,
      },
    },
    { headers: { "cache-control": "no-store" } },
  );
}
