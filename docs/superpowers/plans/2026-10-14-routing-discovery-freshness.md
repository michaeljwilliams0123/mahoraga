# Recheck routing freshness after provider discovery

Scope: fix stale-time authorization in the existing universal execution broker.
No new provider, binding, spending path, authentication change, or capability.

## Reproduction

On main `9eb823be5e4728765c201cac869aebb00da6c0ee`, discovery used a
timestamp sampled before asynchronous provider capability reads. A later binding
could delay discovery beyond an earlier attestation's expiry or the request
deadline. Route and handoff returned expired leases; execute invoked the provider
before rejecting the completion. Capability projection advertised expired proof.
Conversely, fresh universal and legacy proof observed during a slow read could be
rejected against the older clock. Nine focused regressions failed before the fix.

## Implementation and validation

1. Pass the existing injectable clock through discovery; validate each provider
   response after its read, including legacy adaptation.
2. Resample time after all discovery before capability projection, route selection,
   lease issuance, and each execution-chain dispatch. Validate handoff input after
   reading the request body. Preserve existing authority and completion checks.
3. Cover expired proof and crossed deadlines on route, execute, and handoff;
   capability projection timestamp; fresh universal/legacy proof; and successor
   discovery expiry after a valid first execution.
4. Run focused regression tests, diff/baseline checks, full verification, protected
   exact-head Ubuntu and Windows checks, then merge and verify canonical Cloudflare
   deployment and acceptance for the merged SHA. Record evidence under #962/#786.

Synthetic provider fixtures prove dispatch rejection, not a live external-provider
transaction or owner browser/Windows acceptance. Those evidence domains remain
separate.
