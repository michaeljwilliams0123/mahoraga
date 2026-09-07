const ALLOWED_STATES = new Set(['blocked', 'optional', 'open', 'unverified', 'closed', 'refused']);
const PRIORITIES = new Set(['critical', 'high', 'medium', 'low']);

export function normalizeStewardGapAudit(values = []) {
  if (!Array.isArray(values)) fail('steward-gap-audit-invalid');
  if (values.length > 1024) fail('steward-gap-audit-too-large');
  const seen = new Set();
  const normalized = values.map((value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) fail('steward-gap-invalid');
    const id = checkedSlug(value.id, 'steward-gap-id-invalid');
    if (seen.has(id)) fail('steward-gap-duplicate');
    seen.add(id);
    const state = String(value.state ?? '');
    if (!ALLOWED_STATES.has(state)) fail('steward-gap-state-invalid');
    const priority = String(value.priority ?? '');
    if (!PRIORITIES.has(priority)) fail('steward-gap-priority-invalid');
    return Object.freeze({
      id,
      state: state === 'blocked' ? 'unverified' : state,
      priority,
      summary: checkedText(value.summary, 2_000, 'steward-gap-summary-invalid'),
      dependency: checkedText(value.dependency, 4_000, 'steward-gap-dependency-invalid'),
      workloadClass: checkedSlug(value.workloadClass ?? inferWorkloadClass(id), 'steward-gap-workload-invalid'),
      sourceState: state,
    });
  });
  return Object.freeze(normalized.sort((a, b) => a.id.localeCompare(b.id)));
}

function inferWorkloadClass(id) {
  if (id.includes('research')) return 'research';
  if (id.includes('artifact')) return 'analysis';
  if (id.includes('repository') || id.includes('verify')) return 'engineering';
  if (id.includes('browser')) return 'browser';
  if (id.includes('reasoner')) return 'reasoning';
  if (id.includes('microsoft') || id.includes('workspace')) return 'work-systems';
  if (id.includes('copilot') || id.includes('codex')) return 'coding';
  return 'operations';
}

function checkedSlug(value, code) {
  if (typeof value !== 'string' || !/^[a-z0-9][a-z0-9-]{1,63}$/.test(value)) fail(code);
  return value;
}

function checkedText(value, maximum, code) {
  if (typeof value !== 'string') fail(code);
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (!normalized || normalized.length > maximum || /\0/.test(value)) fail(code);
  return normalized;
}

function fail(code) {
  const error = new TypeError(code);
  error.code = code;
  throw error;
}
