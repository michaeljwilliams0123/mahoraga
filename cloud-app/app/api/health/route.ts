export const dynamic = "force-dynamic";

function deploymentUrl() {
  const explicit = process.env.MAHORAGA_DEPLOYMENT_URL?.trim();
  if (explicit) return explicit;
  const vercelHost = process.env.VERCEL_URL?.trim();
  return vercelHost ? `https://${vercelHost}` : null;
}

function deploymentProvider() {
  const explicit = process.env.MAHORAGA_DEPLOYMENT_PROVIDER?.trim();
  if (explicit) return explicit;
  return process.env.VERCEL_URL ? "vercel" : "local";
}

export async function GET() {
  return Response.json(
    {
      ok: true,
      product: "Mahoraga",
      version: "7.0.0-alpha.2",
      deployment: {
        provider: deploymentProvider(),
        environment: process.env.MAHORAGA_DEPLOYMENT_ENV ?? process.env.VERCEL_ENV ?? "local",
        url: deploymentUrl(),
        commitSha: process.env.MAHORAGA_GIT_COMMIT_SHA ?? process.env.VERCEL_GIT_COMMIT_SHA ?? null,
        gitRef: process.env.MAHORAGA_GIT_COMMIT_REF ?? process.env.VERCEL_GIT_COMMIT_REF ?? null,
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
