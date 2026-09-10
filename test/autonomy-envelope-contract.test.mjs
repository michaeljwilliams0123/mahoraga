import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const loadJson = async (relative) => JSON.parse(await readFile(new URL(relative, root), "utf8"));

const SELF_RUN = [
  "create-branch",
  "author-code-on-feature-branch",
  "modify-code-on-feature-branch",
  "author-schema-or-doc",
  "open-draft-pr",
  "run-offline-validator",
  "run-tests",
  "open-issue",
  "self-review",
  "iterate-on-test-failure",
];

const OWNER_DELEGABLE = [
  "merge-to-main",
  "change-permissions-or-security",
  "deploy-to-test-or-prod",
  "any-external-send-or-share",
  "governance-administration",
  "activate-verified-self-update",
  "provision-or-reconfigure-agent",
];

const CONFIRMATION_REQUIRED = [
  "force-push",
  "delete-branch-or-file",
  "spend-money",
];

const NEVER_AUTOMATED = [
  "handle-or-store-secrets-in-git",
  "self-mint-agent-credentials",
  "send-enterprise-or-local-data-to-github",
  "bypass-tenant-or-identity-controls",
];

function assertExactTier(schema, name, expected) {
  const tier = schema.properties[name];
  assert.equal(tier.type, "array");
  assert.equal(tier.uniqueItems, true);
  assert.equal(tier.minItems, expected.length);
  assert.equal(tier.maxItems, expected.length);
  assert.deepEqual([...tier.items.enum].sort(), [...expected].sort());
}

test("autonomy envelope v2 makes deploy, governance, provisioning, and verified self-update owner-delegable", async () => {
  const envelope = await loadJson("config/autonomy-envelope.json");
  assert.equal(envelope.schemaVersion, 2);
  assert.deepEqual(envelope.selfRun, SELF_RUN);
  assert.deepEqual(envelope.ownerDelegable, OWNER_DELEGABLE);
  assert.deepEqual(envelope.confirmationRequired, CONFIRMATION_REQUIRED);
  assert.deepEqual(envelope.neverAutomated, NEVER_AUTOMATED);
  assert.ok(envelope.ownerDelegable.includes("deploy-to-test-or-prod"));
  assert.ok(envelope.ownerDelegable.includes("activate-verified-self-update"));
  assert.equal(envelope.confirmationRequired.includes("deploy-to-test-or-prod"), false);
});

test("autonomy schema fixes the exact v2 authority tiers", async () => {
  const schema = await loadJson("schemas/autonomy-envelope.schema.json");
  assert.deepEqual(schema.required, ["schemaVersion", "kind", "selfRun", "ownerDelegable", "confirmationRequired", "neverAutomated"]);
  assert.equal(schema.properties.schemaVersion.const, 2);
  assertExactTier(schema, "selfRun", SELF_RUN);
  assertExactTier(schema, "ownerDelegable", OWNER_DELEGABLE);
  assertExactTier(schema, "confirmationRequired", CONFIRMATION_REQUIRED);
  assertExactTier(schema, "neverAutomated", NEVER_AUTOMATED);
});

test("autonomy tiers remain disjoint", async () => {
  const envelope = await loadJson("config/autonomy-envelope.json");
  const tiers = [envelope.selfRun, envelope.ownerDelegable, envelope.confirmationRequired, envelope.neverAutomated];
  const flattened = tiers.flat();
  assert.equal(new Set(flattened).size, flattened.length);
});
