import test from "node:test";
import assert from "node:assert/strict";
import { loadManifest, validateManifest } from "../src/config.mjs";
import {
  resolveEffectiveAuthority,
  validateCapabilityAuthorityScopes,
  validateOwnerAuthorityGrant,
} from "../src/owner-authority.mjs";

const ALL_SCOPES = [
  "build.execute",
  "self.update",
  "repo.write",
  "pr.manage",
  "workflow.dispatch",
  "artifact.manage",
  "connector.invoke",
  "copilot.invoke",
  "copilot.configure",
  "copilot.provision",
  "deployment.request",
  "deployment.execute",
  "governance.manage",
  "accessibility.manage",
];

function grant(overrides = {}) {
  return validateOwnerAuthorityGrant({
    schemaVersion: 1,
    kind: "owner-authority-grant",
    grantId: "owner-sovereign-primary",
    ownerPrincipal: "github:michaeljwilliams0123",
    grantee: "mahoraga-core",
    state: "active",
    scopes: ALL_SCOPES,
    deploymentTargets: ["dev", "test", "prod"],
    confirmationRequiredScopes: [],
    revokedScopes: [],
    ...overrides,
  });
}

test("owner-sovereign grant authorizes gate-free prod deployment only through full authority intersection", () => {
  const decision = resolveEffectiveAuthority({
    grant: grant(),
    requestedScope: "deployment.execute",
    requestedTarget: "prod",
    platformScopes: ["deployment.execute"],
    capabilityScopes: ["deployment.execute"],
  });
  assert.deepEqual(decision, {
    authorized: true,
    reason: null,
    requestedScope: "deployment.execute",
    requestedTarget: "prod",
    confirmationRequired: false,
  });
});

test("platform or capability denial remains authoritative", () => {
  const base = {
    grant: grant(),
    requestedScope: "deployment.execute",
    requestedTarget: "prod",
    capabilityScopes: ["deployment.execute"],
  };
  assert.equal(resolveEffectiveAuthority({ ...base, platformScopes: [] }).reason, "platform-authority-missing");
  assert.equal(resolveEffectiveAuthority({ ...base, platformScopes: ["deployment.execute"], capabilityScopes: [] }).reason, "capability-authority-missing");
  assert.equal(resolveEffectiveAuthority({ ...base, grant: grant({ deploymentTargets: ["dev", "test"] }), platformScopes: ["deployment.execute"] }).reason, "deployment-target-not-granted");
});

test("build and self-update authority can be gate-free but remain revocable", () => {
  for (const scope of ["build.execute", "self.update", "governance.manage"]) {
    const allowed = resolveEffectiveAuthority({
      grant: grant(), requestedScope: scope, platformScopes: [scope], capabilityScopes: [scope],
    });
    assert.equal(allowed.authorized, true);
    assert.equal(allowed.confirmationRequired, false);
    const revoked = resolveEffectiveAuthority({
      grant: grant({ revokedScopes: [scope] }), requestedScope: scope, platformScopes: [scope], capabilityScopes: [scope],
    });
    assert.equal(revoked.reason, "owner-scope-revoked");
  }
});

test("grant validation rejects authority ambiguity and secret-bearing fields", () => {
  assert.throws(() => grant({ scopes: ["deployment.execute", "deployment.execute"] }), /scope/i);
  assert.throws(() => grant({ deploymentTargets: ["prod", "prod"] }), /target/i);
  assert.throws(() => grant({ confirmationRequiredScopes: ["not.a.scope"] }), /confirmation/i);
  assert.throws(() => validateOwnerAuthorityGrant({
    schemaVersion: 1, kind: "owner-authority-grant", grantId: "owner-sovereign-primary",
    ownerPrincipal: "github:michaeljwilliams0123", grantee: "mahoraga-core", state: "active",
    scopes: ["deployment.execute"], deploymentTargets: ["prod"], confirmationRequiredScopes: [], revokedScopes: [],
    secret: "do-not-accept",
  }), /field|secret/i);
});

test("capability authority declarations are capability-specific", () => {
  const map = validateCapabilityAuthorityScopes({
    "studio.delegate": ["copilot.invoke"],
    "studio.deploy": ["deployment.request", "deployment.execute"],
    "studio.provision": ["copilot.provision"],
  }, ["studio.delegate", "studio.deploy", "studio.provision"]);
  assert.deepEqual(map["studio.deploy"], ["deployment.request", "deployment.execute"]);
  assert.equal(Object.isFrozen(map), true);
  assert.throws(() => validateCapabilityAuthorityScopes({ "studio.unknown": ["deployment.execute"] }, ["studio.delegate"]), /capability/i);
  assert.throws(() => validateCapabilityAuthorityScopes({ "studio.delegate": ["deployment.execute", "deployment.execute"] }, ["studio.delegate"]), /scope/i);
});

test("manifest installs broad owner authority and capability-specific Copilot/build self authority", async () => {
  const manifest = await loadManifest();
  assert.equal(manifest.ownerAuthority.state, "active");
  assert.ok(manifest.ownerAuthority.scopes.includes("deployment.execute"));
  assert.ok(manifest.ownerAuthority.scopes.includes("self.update"));
  assert.deepEqual(manifest.ownerAuthority.deploymentTargets, ["dev", "test", "prod"]);
  assert.deepEqual(manifest.ownerAuthority.confirmationRequiredScopes, []);

  const studio = manifest.workers.find((worker) => worker.id === "copilot-studio");
  assert.ok(studio.capabilities.includes("studio.deploy"));
  assert.deepEqual(studio.authorityScopesByCapability["studio.deploy"], ["connector.invoke", "deployment.request", "deployment.execute"]);
  const builder = manifest.workers.find((worker) => worker.id === "primary-codex-builder");
  assert.ok(builder.authorityScopesByCapability["self.evolve"].includes("self.update"));

  const invalid = structuredClone(manifest);
  invalid.ownerAuthority.scopes = ["unknown.scope"];
  assert.throws(() => validateManifest(invalid), /authority|scope/i);
});
