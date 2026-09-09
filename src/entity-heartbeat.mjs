import { createHash } from 'node:crypto';

export const ENTITY_HEARTBEAT_SCHEMA_VERSION = 1;
const METHODS = Object.freeze([
  'observe','updateResponsibilities','deriveObjectives','reconcileObjectives','dispatchRoutable',
  'identifyResearch','identifyCapabilityGaps','learnFromOutcomes','updateMemory',
]);

export function createEntityHeartbeat(adapters, { now = () => new Date() } = {}) {
  if (!adapters || typeof adapters !== 'object' || Array.isArray(adapters) || typeof now !== 'function') fail('entity-heartbeat-invalid');
  for (const method of METHODS) if (typeof adapters[method] !== 'function') fail('entity-heartbeat-adapter-invalid');

  return Object.freeze({
    async cycle(input = {}) {
      const entityId = slug(input.entityId, 'entity-heartbeat-entity-invalid');
      const missionId = slug(input.missionId, 'entity-heartbeat-mission-invalid');
      const observedAt = canonical(now());
      const world = await adapters.observe({ entityId, missionId, observedAt });
      const responsibilities = await adapters.updateResponsibilities({ entityId, missionId, world, observedAt });
      const candidates = boundedArray(await adapters.deriveObjectives({ entityId, missionId, world, responsibilities, observedAt }), 4096, 'entity-heartbeat-objectives-invalid');
      const objectives = boundedArray(await adapters.reconcileObjectives({ entityId, missionId, candidates, world, responsibilities, observedAt }), 4096, 'entity-heartbeat-objectives-invalid');
      const dispatches = boundedArray(await adapters.dispatchRoutable({ entityId, missionId, objectives, world, responsibilities, observedAt }), 4096, 'entity-heartbeat-dispatch-invalid');
      const research = boundedArray(await adapters.identifyResearch({ entityId, missionId, objectives, world, responsibilities, dispatches, observedAt }), 2048, 'entity-heartbeat-research-invalid');
      const capabilityGaps = boundedArray(await adapters.identifyCapabilityGaps({ entityId, missionId, objectives, world, responsibilities, dispatches, observedAt }), 2048, 'entity-heartbeat-gaps-invalid');
      const learned = boundedArray(await adapters.learnFromOutcomes({ entityId, missionId, objectives, dispatches, world, observedAt }), 4096, 'entity-heartbeat-learning-invalid');
      const memory = await adapters.updateMemory({ entityId, missionId, learned, research, capabilityGaps, objectives, dispatches, world, observedAt });
      const core = {
        schemaVersion: ENTITY_HEARTBEAT_SCHEMA_VERSION,
        kind: 'entity-heartbeat-receipt',
        entityId, missionId, observedAt,
        objectiveCount: objectives.length,
        dispatchCount: dispatches.length,
        researchCount: research.length,
        capabilityGapCount: capabilityGaps.length,
        learnedCount: learned.length,
        worldDigest: digest(world),
        responsibilityDigest: digest(responsibilities),
        memoryDigest: digest(memory),
        zeroCredit: true,
        providerRequired: false,
      };
      return deepFreeze({ ...core, fingerprint: digest(core) });
    },
  });
}

function boundedArray(value, max, code) { if (!Array.isArray(value) || value.length > max) fail(code); return value; }
function slug(value, code) { if (typeof value !== 'string' || !/^[a-z0-9][a-z0-9-]{1,95}$/.test(value)) fail(code); return value; }
function canonical(value) { const d=value instanceof Date?value:new Date(value); if (!Number.isFinite(d.getTime())) fail('entity-heartbeat-clock-invalid'); const out=d.toISOString(); if (typeof value==='string' && value!==out) fail('entity-heartbeat-clock-invalid'); return out; }
function digest(value) { return createHash('sha256').update(stable(value)).digest('hex'); }
function stable(value) { if (Array.isArray(value)) return '['+value.map(stable).join(',')+']'; if (value && typeof value==='object') return '{'+Object.keys(value).sort().map((k)=>JSON.stringify(k)+':'+stable(value[k])).join(',')+'}'; return JSON.stringify(value) ?? 'null'; }
function deepFreeze(value) { if (value && typeof value === 'object' && !Object.isFrozen(value)) { Object.freeze(value); for (const child of Object.values(value)) deepFreeze(child); } return value; }
function fail(code) { const error=new TypeError(code); error.code=code; throw error; }
