# Cloudflare Pages bridge frame contract

Research baseline: main `e5cda30645461f0ede94ee20ef804ec8f78ad210`.

The owner gateway serves its own inline iframe. Improving the Next workspace frame alone does not change this Cloudflare transport. The old native frame accepted extra request fields, had no action deadline, and reported an expired Cloudflare Access session as a generic gateway failure.

`deploy/cloudflare-owner-gateway/bridge-frame.ts` now owns the native frame renderer. The existing gateway still checks the exact Access owner before serving it. The frame checks both the configured Pages origin and the parent window, exact request fields, protocol version, bounded request IDs and action names. An action body is limited to 32 KiB. A 60-second deadline covers fetch and response decoding; expiration aborts the request without replaying an action. HTTP 401/403 clears the frame's authenticated state and reports `cloud-owner-auth-required`. A disconnected frame cannot restore authentication by receiving a login message.

The four-digit login field preserves the existing protocol shape; Cloudflare Access is the authentication boundary. No owner token is sent to the parent, URL, storage or diagnostics. The gateway remains the action allowlist authority. Malformed replies and unbounded server error text become bounded error codes.

References:

- [MDN postMessage security guidance](https://developer.mozilla.org/en-US/docs/Web/API/Window/postMessage): verify sender origin/source and use an exact target origin.
- [Cloudflare HTTP service bindings](https://developers.cloudflare.com/workers/runtime-apis/bindings/service-bindings/http/): internal runtime calls use the configured binding.

Verification: `test/cloudflare-frame-contract.test.ts` executes the generated script with a controlled parent/fetch/timer harness. It covers wrong origin/source, extra fields, Access expiry, stalled body decoding, abort cleanup, oversized requests and malformed replies. Existing owner gateway native bridge and security tests cover the outer boundary. Local tests are source evidence, not a private owner's browser transaction or deployment proof.
