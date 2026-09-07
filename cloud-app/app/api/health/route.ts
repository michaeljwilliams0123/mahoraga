export const dynamic = "force-dynamic";

function deploymentProvider() {
  if (process.env.NETLIFY === "true") return "netlify";
  if (process.env.VERCEL === "1") return "vercel";
  return "local";
}

function deploymentUrl() {
  const netlify = process.env.DEPLOY_PRIME_URL?.trim() || process.env.URL?.trim();
  if (netlify) return netlify;
  const vercel = process.env.VERCEL_URL?.trim();
  return vercel ? `https://${vercel}` : null;
}

export async function GET() {
  return Response.json(
    {
      ok: true,
      product: "Mahoraga",
      version: "7.0.0-alpha.2",
      deployment: {
        provider: deploymentProvider(),
        environment: process.env.CONTEXT ?? process.env.VERCEL_ENV ?? "local",
        url: deploymentUrl(),
        commitSha: process.env.COMMIT_REF ?? process.env.VERCEL_GIT_COMMIT_SHA ?? null,
        gitRef: process.env.BRANCH ?? process.env.VERCEL_GIT_COMMIT_REF ?? null,
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
