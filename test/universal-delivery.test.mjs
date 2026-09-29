import test from "node:test";
import assert from "node:assert/strict";
import {
  createDeliveryState,
  markUniversalDeliveryDelivered,
  projectUniversalDeliveryReceipt,
  queueUniversalDelivery,
  validateUniversalDeliveryReceipt,
} from "../src/universal-delivery.mjs";

const CREATED = "2026-09-29T22:35:00.000Z";
const QUEUED = "2026-09-29T22:36:00.000Z";
const DELIVERED = "2026-09-29T22:40:00.000Z";
const base = (overrides = {}) => ({
  interactionId:"interaction-0123456789abcdef0123456789abcdef",
  taskId:"task-1",
  chainId:"chain-1",
  idempotencyKey:"owner:universal-reach:1",
  outputReferences:["art-final-output-0123456789abcdef"],
  channelFamily:"native",
  ...overrides,
});

test("offline completed output queues immutable references and reconnect delivers the same result", () => {
  const initial = createDeliveryState(base(), { now:CREATED });
  assert.equal(initial.status, "hold");
  const queued = queueUniversalDelivery(initial, "offline", { now:QUEUED });
  assert.equal(queued.status, "queued");
  assert.deepEqual(queued.outputReferences, initial.outputReferences);
  assert.equal(queued.interactionId, initial.interactionId);
  assert.equal(queued.taskId, initial.taskId);
  assert.equal(queued.chainId, initial.chainId);

  const delivered = markUniversalDeliveryDelivered(queued, { now:DELIVERED });
  assert.equal(delivered.status, "delivered");
  assert.equal(delivered.deliveredAt, DELIVERED);
  assert.deepEqual(delivered.outputReferences, queued.outputReferences);
  assert.equal(delivered.lineageFingerprint, initial.lineageFingerprint);

  const repeated = markUniversalDeliveryDelivered(delivered, { now:"2026-09-29T22:45:00.000Z" });
  assert.deepEqual(repeated, delivered);
  assert.equal(repeated.deliveredAt, DELIVERED);
  assert.deepEqual(projectUniversalDeliveryReceipt(repeated), projectUniversalDeliveryReceipt(delivered));
});

test("degraded or interrupted streaming may queue delivery without rewriting execution completion", () => {
  const queued = queueUniversalDelivery(createDeliveryState(base(), { now:CREATED }), "stream-interrupted", { now:QUEUED });
  const receipt = projectUniversalDeliveryReceipt(queued);
  assert.equal(receipt.status, "queued");
  assert.equal(receipt.reason, "stream-interrupted");
  assert.equal(Object.hasOwn(receipt, "executionStatus"), false);
  assert.equal(Object.hasOwn(receipt, "execute"), false);
  assert.equal(Object.hasOwn(receipt, "providerCredential"), false);
  assert.equal(Object.hasOwn(receipt, "trafficAuthority"), false);
});

test("delivery retries fail closed when immutable lineage or outputs are tampered", () => {
  const queued = queueUniversalDelivery(createDeliveryState(base(), { now:CREATED }), "offline", { now:QUEUED });
  for (const patch of [
    { outputReferences:["art-other-output-0123456789abcdef"] },
    { taskId:"task-2" },
    { chainId:"chain-2" },
    { interactionId:"interaction-fedcba9876543210fedcba9876543210" },
    { idempotencyKey:"owner:universal-reach:other" },
  ]) {
    const tampered = { ...structuredClone(queued), ...patch };
    assert.throws(() => markUniversalDeliveryDelivered(tampered, { now:DELIVERED }), /universal-delivery-state-invalid/);
  }
});

test("delivery state and receipt validate bounded lineage and reject authority or credential fields", () => {
  assert.throws(() => createDeliveryState(base({ providerCredential:"secret" }), { now:CREATED }), /universal-delivery-input-invalid/);
  assert.throws(() => createDeliveryState(base({ execute:() => {} }), { now:CREATED }), /universal-delivery-input-invalid/);
  assert.throws(() => createDeliveryState(base({ outputReferences:["https://example.com/raw"] }), { now:CREATED }), /universal-delivery-output-reference-invalid/);

  const delivered = markUniversalDeliveryDelivered(createDeliveryState(base(), { now:CREATED }), { now:DELIVERED });
  const receipt = projectUniversalDeliveryReceipt(delivered);
  const validated = validateUniversalDeliveryReceipt(receipt);
  assert.deepEqual(validated, receipt);
  assert.equal(Object.isFrozen(validated), true);
  assert.equal(Object.isFrozen(validated.outputReferences), true);
  assert.throws(() => validateUniversalDeliveryReceipt({ ...receipt, trafficAuthority:true }), /universal-delivery-receipt-invalid/);
  assert.throws(() => validateUniversalDeliveryReceipt({ ...receipt, outputReferences:["art-tampered-0123456789abcdef"] }), /universal-delivery-fingerprint-invalid/);
});

test("task and chain identifiers remain optional but paired when present", () => {
  const noTask = createDeliveryState(base({ taskId:undefined, chainId:undefined }), { now:CREATED });
  const receipt = projectUniversalDeliveryReceipt(markUniversalDeliveryDelivered(noTask, { now:DELIVERED }));
  assert.equal(Object.hasOwn(receipt, "taskId"), false);
  assert.equal(Object.hasOwn(receipt, "chainId"), false);
  assert.throws(() => createDeliveryState(base({ chainId:undefined }), { now:CREATED }), /universal-delivery-lineage-invalid/);
});
