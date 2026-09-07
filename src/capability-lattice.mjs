const DIMENSIONS = Object.freeze({
  initiative: Object.freeze(['reactive', 'anticipatory', 'self-originated']),
  authority: Object.freeze(['observe', 'prepare', 'act', 'coordinate', 'administer']),
  horizon: Object.freeze(['immediate', 'daily', 'project', 'strategic', 'persistent']),
  representation: Object.freeze(['assistant', 'delegate', 'proxy', 'operator', 'organizational-function']),
  learning: Object.freeze(['remember', 'generalize', 'experiment', 'teach', 'evolve']),
  coordination: Object.freeze(['solo', 'child-agents', 'platform-agents', 'multi-system']),
  environment: Object.freeze(['local', 'repository', 'work-systems', 'public-internet', 'external-connectors']),
  reasoning: Object.freeze(['deterministic', 'local-model', 'subscription-model', 'external-model']),
  persistence: Object.freeze(['turn', 'task', 'project', 'role', 'institutional']),
  autonomy: Object.freeze(['user-directed', 'objective-directed', 'mission-directed']),
});

const KEYS = Object.freeze(Object.keys(DIMENSIONS));

export function createCapabilityProfile(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail('capability-profile-invalid');
  const keys = Object.keys(input);
  if (keys.length !== KEYS.length || keys.some((key) => !Object.hasOwn(DIMENSIONS, key))) fail('capability-profile-invalid');
  const profile = {};
  for (const key of KEYS) {
    const value = input[key];
    if (!DIMENSIONS[key].includes(value)) fail('capability-profile-invalid');
    profile[key] = value;
  }
  return deepFreeze(profile);
}

export function compareCapabilityProfiles(leftInput, rightInput) {
  const left = createCapabilityProfile(leftInput);
  const right = createCapabilityProfile(rightInput);
  const deltas = {};
  let broadensAuthority = false;
  let narrowsAuthority = false;
  for (const key of KEYS) {
    const delta = DIMENSIONS[key].indexOf(right[key]) - DIMENSIONS[key].indexOf(left[key]);
    deltas[key] = delta;
    if (delta > 0) broadensAuthority = true;
    if (delta < 0) narrowsAuthority = true;
  }
  return deepFreeze({ deltas, broadensAuthority, narrowsAuthority });
}

export function capabilityDimensions() {
  return DIMENSIONS;
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
