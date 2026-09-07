import { createCapabilityProfile } from './capability-lattice.mjs';

const KEYS = new Set([
  'schemaVersion',
  'entityId',
  'displayName',
  'ownerId',
  'mission',
  'principles',
  'successCriteria',
  'defaultAuthorityProfile',
  'createdAt',
  'updatedAt',
]);

export function createEntityConstitution(input, { now = () => new Date() } = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || typeof now !== 'function') fail('entity-constitution-invalid');
  const timestamp = canonicalTimestamp(now());
  return validateEntityConstitution({
    schemaVersion: 1,
    entityId: checkedId(input.entityId),
    displayName: checkedText(input.displayName, 120),
    ownerId: checkedId(input.ownerId),
    mission: checkedText(input.mission, 2000),
    principles: checkedTextList(input.principles, 64, 160),
    successCriteria: checkedTextList(input.successCriteria, 64, 200),
    defaultAuthorityProfile: createCapabilityProfile(input.defaultAuthorityProfile),
    createdAt: timestamp,
    updatedAt: timestamp,
  });
}

export function validateEntityConstitution(value) {
  exactObject(value, KEYS);
  if (value.schemaVersion !== 1) fail('entity-constitution-invalid');
  const createdAt = canonicalTimestamp(value.createdAt);
  const updatedAt = canonicalTimestamp(value.updatedAt);
  if (Date.parse(updatedAt) < Date.parse(createdAt)) fail('entity-constitution-invalid');
  return deepFreeze({
    schemaVersion: 1,
    entityId: checkedId(value.entityId),
    displayName: checkedText(value.displayName, 120),
    ownerId: checkedId(value.ownerId),
    mission: checkedText(value.mission, 2000),
    principles: checkedTextList(value.principles, 64, 160),
    successCriteria: checkedTextList(value.successCriteria, 64, 200),
    defaultAuthorityProfile: createCapabilityProfile(value.defaultAuthorityProfile),
    createdAt,
    updatedAt,
  });
}

function exactObject(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('entity-constitution-invalid');
  const actual = Object.keys(value);
  if (actual.length !== keys.size || actual.some((key) => !keys.has(key))) fail('entity-constitution-invalid');
}

function checkedId(value) {
  if (typeof value !== 'string' || !/^[a-z0-9][a-z0-9-]{1,63}$/.test(value)) fail('entity-constitution-invalid');
  return value;
}

function checkedText(value, maximum) {
  if (typeof value !== 'string') fail('entity-constitution-invalid');
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (normalized.length < 1 || normalized.length > maximum || /[\0\r\n]/.test(value)) fail('entity-constitution-invalid');
  return normalized;
}

function checkedTextList(value, maximumItems, maximumLength) {
  if (!Array.isArray(value) || value.length < 1 || value.length > maximumItems) fail('entity-constitution-invalid');
  const normalized = value.map((item) => checkedText(item, maximumLength));
  if (new Set(normalized).size !== normalized.length) fail('entity-constitution-invalid');
  return Object.freeze([...normalized].sort((a, b) => a.localeCompare(b)));
}

function canonicalTimestamp(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) fail('entity-constitution-invalid');
  const timestamp = date.toISOString();
  if (typeof value === 'string' && value !== timestamp) fail('entity-constitution-invalid');
  return timestamp;
}

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

function fail(code) {
  const error = new TypeError(code);
  error.code = code;
  throw error;
}
