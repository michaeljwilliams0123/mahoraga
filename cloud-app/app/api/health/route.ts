export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(
    {
      ok: true,
      product: "Mahoraga",
      capabilities: {
        runtimeRelay: true,
        directConversationExecution: false,
        directProviderSelection: false,
      },
      boundaries: {
        executionPlane: "client-shell-with-owner-paired-core",
        localExtensionRequired: false,
        localDeviceMutationAllowed: false,
        relaySeesPlaintext: false,
      },
      routing: {
        authority: "paired-mahoraga-core",
        automaticPaidFallback: false,
        browserMaySelectProvider: false,
      },
    },
    { headers: { "cache-control": "no-store" } },
  );
}
