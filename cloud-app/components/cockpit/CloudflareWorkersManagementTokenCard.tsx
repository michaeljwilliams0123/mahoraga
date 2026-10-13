export function CloudflareWorkersManagementTokenCard() {
  return (
    <article className="eclipse-status-card neutral" data-testid="cloudflare-workers-management-token">
      <span>Cloudflare Workers Management Token</span>
      <strong>Bound · observational · fail-closed</strong>
      <p>
        CLOUDFLARE_WORKERS_MANAGEMENT_TOKEN is bound only to the protected owner-only Verify Cloudflare Workers Management Token workflow (exact-main, owner actor). verify mode is GET-only and does not claim create/write authority. create-and-deploy-private-canary is a separate isolated proof for mahoraga-workers-management-canary (workers_dev=false, preview_urls=false, no routes/bindings). Original CLOUDFLARE_API_TOKEN remains for production and zero-dollar billing. No token value is displayed. Execution readiness, cognition readiness, and traffic authority remain separate and fail-closed. Railway is zero-authority.
      </p>
    </article>
  );
}
