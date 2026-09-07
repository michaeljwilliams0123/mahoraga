export const dynamic = "force-dynamic";

function deploymentUrl() {
  const explicit = process.env.MAHORAGA_DEPLOYMENT_URL?.trim();
  if (explicit) return explicit;
  const netlify = process.env.DEPLOY_PRIME_URL?.trim() || process.env.URL?.trim();
  if (netlify) return netlify;
  const vercelHost = process.env.VERCEL_URL?.trim();
  return vercelHost ? `https://${vercelHost}` : null;
}

function deploymentProvider() {
  const explicit = process.env.MAHORAGA_DEPLOYMENT_PROVIDER?.trim();
  if (explicit) return explicit;
  if (process.env.NETLIFY === "true") return "netlify";
  if (process.env.VERCEL === "1" || process.env.VERCEL_URL) return "vercel";
  return "local";
}

export async function GET() {
  return Response.json(
    {
      ok: true,
      product: "Mahoraga",
      version: "7.0.0-alpha.2",
      deployment: {
        provider: deploymentProvider(),
        environment: process.env.MAHORAGA_DEPLOYMENT_ENV ?? process.env.CONTEXT ?? process.env.VERCEL_ENV ?? "local",
        url: deploymentUrl(),
        commitSha: process.env.MAHORAGA_GIT_COMMIT_SHA ?? process.env.COMMIT_REF ?? process.env.VERCEL_GIT_COMMIT_SHA ?? null,
        gitRef: process.env.MAHORAGA_GIT_COMMIT_REF ?? process.env.BRANCH ?? process.env.VERCEL_GIT_COMMIT_REF ?? null,
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
