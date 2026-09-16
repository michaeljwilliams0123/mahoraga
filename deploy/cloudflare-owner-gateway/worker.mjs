export default {
  async fetch(request, env, ctx) {
    const ownerId = typeof env?.MAHORAGA_CLOUD_OWNER_ID === "string" ? env.MAHORAGA_CLOUD_OWNER_ID.trim() : "";
    const assertionSecret = typeof env?.MAHORAGA_CLOUD_OWNER_ASSERTION_SECRET === "string" ? env.MAHORAGA_CLOUD_OWNER_ASSERTION_SECRET : "";
    if (!ownerId || assertionSecret.length < 32) {
      return new Response("gateway-environment-invalid", { status: 503 });
    }
    if (!ctx?.access || typeof ctx.access.getIdentity !== "function") {
      return new Response("owner-access-required", { status: 403 });
    }
    let identity;
    try { identity = await ctx.access.getIdentity(); }
    catch { return new Response("owner-access-required", { status: 403 }); }
    const owner = typeof identity?.email === "string" ? identity.email.trim() : "";
    if (!owner || owner !== ownerId) return new Response("owner-auth-required", { status: 401 });

    let origin;
    try {
      origin = new URL(env.MAHORAGA_RUNTIME_ORIGIN);
    } catch {
      return new Response("gateway-origin-invalid", { status: 503 });
    }
    if (origin.protocol !== "https:" || origin.username || origin.password || origin.pathname !== "/" || origin.search || origin.hash) {
      return new Response("gateway-origin-invalid", { status: 503 });
    }

    const requestUrl = new URL(request.url);
    const target = new URL(requestUrl);
    target.protocol = origin.protocol;
    target.host = origin.host;
    if (target.origin === requestUrl.origin) return new Response("gateway-origin-invalid", { status: 503 });

    const timestamp = Date.now();
    const nonce = crypto.randomUUID();
    const assertion = `${owner}\n${timestamp}\n${nonce}`;
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(assertionSecret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const bytes = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(assertion)));
    const signature = btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
    const headers = new Headers(request.headers);
    for (const name of ["x-mahoraga-owner", "x-mahoraga-owner-timestamp", "x-mahoraga-owner-nonce", "x-mahoraga-owner-signature"]) headers.delete(name);
    headers.set("x-mahoraga-owner", owner);
    headers.set("x-mahoraga-owner-timestamp", String(timestamp));
    headers.set("x-mahoraga-owner-nonce", nonce);
    headers.set("x-mahoraga-owner-signature", signature);
    return fetch(new Request(target, { method: request.method, headers, body: request.body, redirect: "manual" }));
  },
};
