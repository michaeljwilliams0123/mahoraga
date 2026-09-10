# Mahoraga Autonomy Model — Owner-Sovereign Authority

> **Contract version:** 2. Mahoraga runs the build-and-propose loop itself and may execute privileged actions from persistent owner delegation when actual platform permission and registered capability authority agree.

## Core authority rule

Mahoraga does not require a second approval merely because an action is privileged when the owner has already granted that scope.

```text
effectiveAuthority = ownerGrant ∩ platformGrantedPermissions ∩ registeredCapability
```

All three must agree. Owner intent cannot fabricate GitHub, Microsoft, tenant, connector, or identity permissions that the active platform connection does not possess.

## 1. Self-run

These reversible build-and-propose actions run directly:

- create feature branches;
- author and modify feature-branch code;
- author schemas and documentation;
- open draft PRs;
- run offline validators and tests;
- open issues;
- self-review;
- iterate on test failures.

This keeps the normal design → build → test → propose loop autonomous.

## 2. Owner-delegable

These actions may execute without another Mahoraga confirmation when the active owner grant, platform permission, and capability declaration authorize them:
- merge to `main` when repository rules and the active merge capability permit it;
- change permissions/security settings through a registered administrative capability;
- deploy to Test or Prod through an authorized deployment capability;
- send/share externally through an owner-authorized connector and allowed data class;
- administer Mahoraga governance inside delegated scope;
- activate a verified Mahoraga self-update;
- provision or reconfigure a Copilot Studio / registered agent capability.

The reference owner grant in `mahoraga.manifest.json` has no `confirmationRequiredScopes`, so matching granted operations do not acquire an additional Mahoraga-side confirmation prompt.

A platform-native approval, branch rule, tenant policy, Conditional Access rule, or connector permission still applies. Mahoraga records that as platform authority rather than trying to bypass it.

## 3. Confirmation-required reference actions

The v2 reference profile keeps these action classes behind explicit confirmation:

- force-push;
- delete a branch or file;
- spend money.

They are separate from deployment authority so a deployment grant is not accidentally treated like destructive history rewriting or an unbounded spend grant.

## 4. Structural boundaries

Owner delegation does not enable:

- raw passwords, tokens, cookies, private keys, or bearer credentials in Git;
- self-minting platform or Copilot Studio credentials;
- enterprise/local content copied into GitHub as a general transport channel;
- bypassing tenant, identity, authentication, or platform controls.

Remote operation remains capability-based. No generic public tunnel, reverse proxy, arbitrary port forwarding, or unrestricted supervisor shell is introduced by this authority model.

## Runtime semantics

Privileged tasks declare an `authorityScope` and, for deployment, an `authorityTarget`. The capability registry exposes only the scopes declared for that exact capability. Runtime context contributes the scopes actually available through the authenticated platform connection.

If any side of the intersection is absent, routing waits with a specific denial reason. Revoked owner scopes take effect before execution. Existing tasks that do not declare privileged authority continue to route under their existing behavior.

## Copilot Studio

The Copilot Studio worker now declares separate health, delegation, configuration, provisioning, and deployment capabilities. This prepares PRs #281–#283 to evolve from design contracts into a registered Microsoft execution plane while keeping transport, authority, and credential handling separate.

Credential values stay outside Git. Runtime integrations use authenticated platform connections or opaque credential/connection references; GitHub remains a coordination and metadata-evidence plane.

## Machine-readable sources

- `config/autonomy-envelope.json` — reference authority tiers.
- `schemas/autonomy-envelope.schema.json` — exact v2 tier contract.
- `mahoraga.manifest.json` — active owner authority grant and capability-specific authority declarations.
- `src/owner-authority.mjs` — deterministic authority intersection and revocation logic.
