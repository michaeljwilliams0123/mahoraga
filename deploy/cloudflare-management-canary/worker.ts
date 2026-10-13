/** Private, non-routable probe for a genuine scoped Worker management credential.
 * This Worker has no network target, owner endpoint, or access to other resources.
 */
type CanaryEnv = { TARGET_SHA?: string };
const HEADERS = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" };
export default {
  async fetch(request: Request, env: CanaryEnv): Promise<Response> {
    const url = new URL(request.url);
    if (request.method !== "GET" || url.pathname !== "/api/health") {
      return new Response(JSON.stringify({ error: "not-found" }), { status: 404, headers: HEADERS });
    }
    return new Response(JSON.stringify({
      kind: "mahoraga-management-canary", status: "alive",
      targetSha: typeof env.TARGET_SHA === "string" ? env.TARGET_SHA : null,
      executionAuthorityGranted: false,
    }), { headers: HEADERS });
  },
} satisfies { fetch(request: Request, env: CanaryEnv): Promise<Response> };
