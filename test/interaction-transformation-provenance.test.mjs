import test from "node:test";
import assert from "node:assert/strict";
import {
  createTransformationReceipt,
  sourceEvidenceReference,
  validateTransformationReceipt,
} from "../src/interaction-transformation-provenance.mjs";

const NOW = "2026-09-29T22:40:00.000Z";
const input = (overrides = {}) => ({
  sourceReference:"art-source-0123456789abcdef",
  sourceFingerprint:"a".repeat(64),
  transformKind:"translation",
  transformVersion:"translator-v1",
  workerReceiptReference:"receipt-worker-0123456789abcdef",
  outputReference:"art-output-0123456789abcdef",
  outputFingerprint:"b".repeat(64),
  confidence:0.92,
  qualityMetadata:[
    { key:"language", value:"fr-FR" },
    { key:"quality-score", value:0.91 },
  ],
  ...overrides,
});

test("creates deterministic frozen derivative receipts while preserving source provenance", () => {
  const first = createTransformationReceipt(input(), { now:NOW });
  const second = createTransformationReceipt(input({ qualityMetadata:[
    { key:"quality-score", value:0.91 },
    { key:"language", value:"fr-FR" },
  ] }), { now:NOW });
  assert.deepEqual(first, second);
  assert.equal(first.kind, "interaction-transformation-receipt");
  assert.equal(first.sourceReference, "art-source-0123456789abcdef");
  assert.equal(first.sourceFingerprint, "a".repeat(64));
  assert.equal(first.outputReference, "art-output-0123456789abcdef");
  assert.equal(first.outputFingerprint, "b".repeat(64));
  assert.equal(first.transformedAt, NOW);
  assert.match(first.fingerprint, /^[a-f0-9]{64}$/);
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(first.qualityMetadata), true);
});

test("supports the approved transform kinds and source evidence always resolves to the original", () => {
  for (const transformKind of ["translation","transcription","ocr","summarization","resize","format-conversion"]) {
    const receipt = createTransformationReceipt(input({ transformKind }), { now:NOW });
    assert.equal(receipt.transformKind, transformKind);
    assert.equal(sourceEvidenceReference(receipt), receipt.sourceReference);
    assert.notEqual(sourceEvidenceReference(receipt), receipt.outputReference);
  }
});

test("rejects source/output identity collapse, malformed fingerprints, duplicate metadata, and secret-bearing metadata", () => {
  assert.throws(() => createTransformationReceipt(input({ outputReference:"art-source-0123456789abcdef" }), { now:NOW }), /interaction-transformation-derivative-invalid/);
  assert.throws(() => createTransformationReceipt(input({ outputFingerprint:"a".repeat(64) }), { now:NOW }), /interaction-transformation-derivative-invalid/);
  assert.throws(() => createTransformationReceipt(input({ sourceFingerprint:"bad" }), { now:NOW }), /interaction-transformation-fingerprint-invalid/);
  assert.throws(() => createTransformationReceipt(input({ qualityMetadata:[{key:"language",value:"en"},{key:"language",value:"fr"}] }), { now:NOW }), /interaction-transformation-metadata-invalid/);
  assert.throws(() => createTransformationReceipt(input({ qualityMetadata:[{key:"provider-token",value:"secret-value"}] }), { now:NOW }), /interaction-transformation-metadata-secret/);
  assert.throws(() => createTransformationReceipt(input({ qualityMetadata:[{key:"note",value:"Bearer super-secret"}] }), { now:NOW }), /interaction-transformation-metadata-secret/);
});

test("receipt is observational provenance only and rejects authority or credential claims", () => {
  const receipt = createTransformationReceipt(input(), { now:NOW });
  for (const key of ["trafficAuthority","providerCredential","actionAuthority","executionPromotion"]) {
    assert.equal(Object.hasOwn(receipt, key), false);
    assert.throws(() => validateTransformationReceipt({ ...receipt, [key]:true }), /interaction-transformation-receipt-invalid/);
  }
  assert.deepEqual(validateTransformationReceipt(receipt), receipt);
});

test("validation detects tampering and optional quality/confidence remain bounded observations", () => {
  const minimal = createTransformationReceipt(input({ confidence:undefined, qualityMetadata:undefined }), { now:NOW });
  assert.equal(Object.hasOwn(minimal, "confidence"), false);
  assert.equal(Object.hasOwn(minimal, "qualityMetadata"), false);
  assert.throws(() => createTransformationReceipt(input({ confidence:1.01 }), { now:NOW }), /interaction-transformation-confidence-invalid/);

  const receipt = createTransformationReceipt(input(), { now:NOW });
  assert.throws(() => validateTransformationReceipt({ ...receipt, outputFingerprint:"c".repeat(64) }), /interaction-transformation-receipt-fingerprint-invalid/);
});
