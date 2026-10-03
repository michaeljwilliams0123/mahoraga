import test from "node:test";
import assert from "node:assert/strict";
import { loadManifest, validateManifest } from "../src/config.mjs";
import {
  NON_DELEGABLE_OWNER_ROOT_ACTIONS,
  resolveBotOperationalAuthority,
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


test("capability authority requires every registered scope and cannot be bypassed by task omission", async () => {
  const { resolveCapabilityAuthority } = await import("../src/owner-authority.mjs");
  const partial = resolveCapabilityAuthority({
    grant: grant(), requestedScope: "deployment.execute", requestedTarget: "prod",
    platformScopes: ["deployment.execute"],
    capabilityScopes: ["connector.invoke", "deployment.request", "deployment.execute"],
  });
  assert.equal(partial.authorized, false);
  assert.equal(partial.reason, "platform-authority-missing");
  assert.deepEqual(partial.requiredScopes, ["connector.invoke", "deployment.request", "deployment.execute"]);

  const omitted = resolveCapabilityAuthority({
    grant: grant(), requestedScope: null, requestedTarget: "prod", platformScopes: [],
    capabilityScopes: ["connector.invoke", "deployment.request", "deployment.execute"],
  });
  assert.equal(omitted.authorized, false);
  assert.equal(omitted.reason, "platform-authority-missing");
});


const BOT = Object.freeze({
  agentId: "mahoraga-builder-bot",
  ownerApprovalRequired: false,
  platformAuthorizationRequired: true,
});
const AUTHORITY_BINDING = Object.freeze({
  objectiveDigest: "a".repeat(64),
  authorityDigest: "b".repeat(64),
  sourceSha: "c".repeat(40),
  trustEpoch: "epoch-42",
  evaluatorFingerprint: "d".repeat(64),
  costClass: "zero-credit",
  audience: "owner-only",
  securityBoundary: "unchanged",
  validUntil: "2026-10-03T04:00:00.000Z",
});
const CURRENT_BINDING = Object.freeze({
  ...Object.fromEntries(Object.entries(AUTHORITY_BINDING).filter(([key]) => key !== "validUntil")),
  observedAt: "2026-10-03T03:00:00.000Z",
});

test("bot receives owner-parity operational authority only through the same scope intersection", () => {
  const decision = resolveBotOperationalAuthority({
    grant: grant(),
    bot: BOT,
    requestedScope: "deployment.execute",
    requestedTarget: "prod",
    platformScopes: ["deployment.execute"],
    capabilityScopes: ["deployment.execute"],
    authorityBinding: AUTHORITY_BINDING,
    currentBinding: CURRENT_BINDING,
    now: "2026-10-03T03:01:00.000Z",
  });
  assert.equal(decision.authorized, true);
  assert.equal(decision.botId, BOT.agentId);
  assert.equal(decision.inheritedFrom, "mahoraga-core");
  assert.equal(decision.driftVerified, true);

  const owner = resolveEffectiveAuthority({
    grant: grant(),
    requestedScope: "deployment.execute",
    requestedTarget: "prod",
    platformScopes: ["deployment.execute"],
    capabilityScopes: ["deployment.execute"],
  });
  assert.equal(decision.authorized, owner.authorized);
});

test("bot parity cannot self-expand missing, revoked, or platform-denied authority", () => {
  const base = {
    bot: BOT,
    requestedScope: "deployment.execute",
    requestedTarget: "prod",
    authorityBinding: AUTHORITY_BINDING,
    currentBinding: CURRENT_BINDING,
    now: "2026-10-03T03:01:00.000Z",
  };
  assert.equal(resolveBotOperationalAuthority({
    ...base,
    grant: grant({ scopes: ALL_SCOPES.filter((scope) => scope !== "deployment.execute") }),
    platformScopes: ["deployment.execute"],
    capabilityScopes: ["deployment.execute"],
  }).reason, "owner-authority-missing");
  assert.equal(resolveBotOperationalAuthority({
    ...base,
    grant: grant({ revokedScopes: ["deployment.execute"] }),
    platformScopes: ["deployment.execute"],
    capabilityScopes: ["deployment.execute"],
  }).reason, "owner-scope-revoked");
  assert.equal(resolveBotOperationalAuthority({
    ...base,
    grant: grant(),
    platformScopes: [],
    capabilityScopes: ["deployment.execute"],
  }).reason, "platform-authority-missing");
});

test("bot authority fails closed on source, authority, evaluator, epoch, cost, audience, or security drift", () => {
  const base = {
    grant: grant(),
    bot: BOT,
    requestedScope: "repo.write",
    platformScopes: ["repo.write"],
    capabilityScopes: ["repo.write"],
    authorityBinding: AUTHORITY_BINDING,
    now: "2026-10-03T03:01:00.000Z",
  };
  const drifts = [
    { sourceSha: "e".repeat(40) },
    { authorityDigest: "e".repeat(64) },
    { evaluatorFingerprint: "e".repeat(64) },
    { trustEpoch: "epoch-43" },
    { costClass: "metered" },
    { audience: "external" },
    { securityBoundary: "expanded" },
  ];
  for (const drift of drifts) {
    const decision = resolveBotOperationalAuthority({
      ...base,
      currentBinding: { ...CURRENT_BINDING, ...drift },
    });
    assert.equal(decision.authorized, false);
    assert.equal(decision.reason, "bot-authority-drift");
  }
});

test("bot authority rejects stale or future evidence and keeps owner-root actions non-delegable", () => {
  const base = {
    grant: grant(),
    bot: BOT,
    requestedScope: "governance.manage",
    platformScopes: ["governance.manage"],
    capabilityScopes: ["governance.manage"],
    authorityBinding: AUTHORITY_BINDING,
    currentBinding: CURRENT_BINDING,
  };
  assert.equal(resolveBotOperationalAuthority({
    ...base,
    now: "2026-10-03T04:00:00.001Z",
  }).reason, "bot-authority-binding-stale");
  assert.equal(resolveBotOperationalAuthority({
    ...base,
    currentBinding: { ...CURRENT_BINDING, observedAt: "2026-10-03T03:02:00.001Z" },
    now: "2026-10-03T03:01:00.000Z",
  }).reason, "bot-authority-binding-future");

  for (const ownerRootAction of NON_DELEGABLE_OWNER_ROOT_ACTIONS) {
    assert.equal(resolveBotOperationalAuthority({
      ...base,
      ownerRootAction,
      now: "2026-10-03T03:01:00.000Z",
    }).reason, "owner-root-nondelegable");
  }
});
