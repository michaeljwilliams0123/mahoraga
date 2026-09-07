export const dynamic = "force-dynamic";

function deploymentUrl() {
  const host = process.env.VERCEL_URL?.trim();
  return host ? `https://${host}` : null;
}

export async function GET() {
  return Response.json(
    {
      ok: true,
      product: "Mahoraga",
      version: "7.0.0-alpha.2",
      deployment: {
        environment: process.env.VERCEL_ENV ?? "local",
        url: deploymentUrl(),
        commitSha: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
        gitRef: process.env.VERCEL_GIT_COMMIT_REF ?? null,
      },
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
