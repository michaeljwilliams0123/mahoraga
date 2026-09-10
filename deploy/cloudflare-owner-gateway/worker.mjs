export default {
  async fetch(request, env) {
    const owner = request.headers.get("cf-access-authenticated-user-email") ?? "";
    if (!owner || owner !== env.MAHORAGA_CLOUD_OWNER_ID) return new Response("owner-auth-required", { status: 401 });
    const origin = new URL(env.MAHORAGA_FLY_ORIGIN);
    if (origin.protocol !== "https:" || origin.username || origin.password || origin.pathname !== "/") return new Response("gateway-origin-invalid", { status: 503 });
    const timestamp = Date.now();
    const nonce = crypto.randomUUID();
    const assertion = `${owner}\n${timestamp}\n${nonce}`;
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(env.MAHORAGA_CLOUD_OWNER_ASSERTION_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const bytes = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(assertion)));
    const signature = btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
    const headers = new Headers(request.headers);
    for (const name of ["x-mahoraga-owner", "x-mahoraga-owner-timestamp", "x-mahoraga-owner-nonce", "x-mahoraga-owner-signature"]) headers.delete(name);
    headers.set("x-mahoraga-owner", owner);
    headers.set("x-mahoraga-owner-timestamp", String(timestamp));
    headers.set("x-mahoraga-owner-nonce", nonce);
    headers.set("x-mahoraga-owner-signature", signature);
    const target = new URL(request.url); target.protocol = origin.protocol; target.host = origin.host;
    return fetch(new Request(target, { method: request.method, headers, body: request.body, redirect: "manual" }));
  },
};
