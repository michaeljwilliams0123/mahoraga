import test from "node:test";
import assert from "node:assert/strict";
import {
  cloneTwinDescriptor,
  createTwinDescriptor,
  validateTwinDescriptor,
} from "../src/twin-federation.mjs";

const sha = "803baa806ad64cc2e3b4b5be75f4dcecf21e3bf1";
const createdAt = "2026-09-08T01:30:00.000Z";

function primary(overrides = {}) {
  return createTwinDescriptor({
    federationId: "mahoraga-federation",
    peerId: "mahoraga-primary",
    repository: "michaeljwilliams0123/mahoraga",
    commit: sha,
    capabilities: ["twin.review", "twin.analyze", "twin.build"],
    ...overrides,
  }, { createdAt });
}

test("creates an immutable primary twin descriptor bound to Mahoraga", () => {
  const value = primary();
  assert.deepEqual(value, {
    schemaVersion: 1,
    federationId: "mahoraga-federation",
    peerId: "mahoraga-primary",
    parentPeerId: null,
    generation: 0,
    repository: "michaeljwilliams0123/mahoraga",
    commit: sha,
    capabilities: ["twin.analyze", "twin.build", "twin.review"],
    createdAt,
  });
  assert.equal(Object.isFrozen(value), true);
  assert.equal(Object.isFrozen(value.capabilities), true);
});

test("clones a distinct peer while inheriting federation code and capabilities", () => {
  const source = primary();
  const clone = cloneTwinDescriptor(source, { peerId: "mahoraga-twin-1" }, { createdAt: "2026-09-08T01:31:00.000Z" });
  assert.deepEqual(clone, {
    schemaVersion: 1,
    federationId: source.federationId,
    peerId: "mahoraga-twin-1",
    parentPeerId: source.peerId,
    generation: 1,
    repository: source.repository,
    commit: source.commit,
    capabilities: source.capabilities,
    createdAt: "2026-09-08T01:31:00.000Z",
  });
  assert.notEqual(clone.peerId, source.peerId);
});

test("rejects credential-shaped or unknown descriptor fields", () => {
  const value = primary();
  assert.throws(() => validateTwinDescriptor({ ...value, token: "secret" }), /twin-descriptor-invalid/);
  assert.throws(() => createTwinDescriptor({
    federationId: "mahoraga-federation",
    peerId: "mahoraga-primary",
    repository: "other/repo",
    commit: sha,
    capabilities: [],
  }, { createdAt }), /twin-repository-invalid/);
});

test("rejects clone identity collisions", () => {
  const source = primary();
  assert.throws(() => cloneTwinDescriptor(source, { peerId: source.peerId }, { createdAt }), /twin-peer-collision/);
});
