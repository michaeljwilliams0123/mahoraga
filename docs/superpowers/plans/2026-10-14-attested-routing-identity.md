# Attested routing identity repair plan

**Goal:** Preserve independently validated worker identity, timing, ranking and actual service-binding provenance through route selection and execution.

**Spec:** Owner-directed critical-routing fixes; #962 anti-drift and #786 canonical source/execution authority.

**Architecture:** Project only validated capability fields into the route. Bind every admitted provider identity to the same service binding that supplied its attestation. Preserve existing repository/github aliases.

**Constraints:** No provider activation, credential changes, paid fallback or protected-check changes. Preserve objective/chain identity, authority, freshness, leases, idempotency and canonical routing.

### Task 1: Attested executor identity

- [x] Add core regressions for identity/expiry/metrics shadowing and unknown-field projection.
- [x] Add broker regressions proving cross-binding attestations never invoke another executor and nested shadowing cannot redirect execution; preserve the repository alias.
- [x] Observe RED, implement the minimum projection and binding-provenance corrections, observe GREEN.
- [ ] Verify core/broker integration, typechecks, baseline and full exact-head protected CI.
- [ ] Integrate through protected PR and observe canonical current-main Cloudflare acceptance.

**Review focus:** valid route identity and lease expiry come from the attestation; malformed or cross-binding provider evidence is denied; capability permission/cost/authority remain intact; same-source aliases remain executable; unknown capability metadata never becomes route metadata.
