const COST_ORDER = new Map([
  ["deterministic", 0],
  ["local-model", 1],
  ["licensed-cloud", 2],
  ["metered-cloud", 3],
]);
const BUDGET_KEYS = new Set([
  "depth", "maximumDepth", "maximumChildWorkers", "maximumCycles", "maximumTokens",
  "spendingClass", "inheritedDenyRules", "childAllowRules",
]);
const OVERRIDE_KEYS = new Set([
  "maximumDepth", "maximumChildWorkers", "maximumCycles", "maximumTokens",
  "spendingClass", "inheritedDenyRules", "childAllowRules",
]);

export function validateExecutionBudget(value) {
  exact(value, BUDGET_KEYS, "execution-budget-invalid");
  integer(value.depth, 0, 32, "execution-budget-invalid");
  integer(value.maximumDepth, 0, 32, "execution-budget-invalid");
  if (value.depth > value.maximumDepth) fail("execution-depth-exhausted");
  integer(value.maximumChildWorkers, 0, 16, "execution-budget-invalid");
  integer(value.maximumCycles, 1, 10_000, "execution-budget-invalid");
  integer(value.maximumTokens, 1, 10_000_000, "execution-budget-invalid");
  if (!COST_ORDER.has(value.spendingClass)) fail("execution-budget-invalid");
  rules(value.inheritedDenyRules, "execution-budget-invalid");
  rules(value.childAllowRules, "execution-budget-invalid");
  if (value.childAllowRules.some((rule) => value.inheritedDenyRules.includes(rule))) fail("execution-budget-invalid");
  return deepFreeze(structuredClone(value));
}

export function deriveChildBudget(parentValue, overrides = {}) {
  const parent = validateExecutionBudget(parentValue);
  if (parent.depth >= parent.maximumDepth) fail("execution-depth-exhausted");
  if (!overrides || typeof overrides !== "object" || Array.isArray(overrides) || Object.keys(overrides).some((key) => !OVERRIDE_KEYS.has(key))) {
    fail("execution-budget-invalid");
  }
  const child = { ...parent, ...structuredClone(overrides), depth: parent.depth + 1 };
  validateExecutionBudget(child);
  for (const field of ["maximumDepth", "maximumChildWorkers", "maximumCycles", "maximumTokens"]) {
    if (child[field] > parent[field]) fail("execution-budget-escalation");
  }
  if (COST_ORDER.get(child.spendingClass) > COST_ORDER.get(parent.spendingClass)) fail("execution-budget-escalation");
  if (parent.inheritedDenyRules.some((rule) => !child.inheritedDenyRules.includes(rule))) fail("execution-budget-escalation");
  if (child.childAllowRules.some((rule) => !parent.childAllowRules.includes(rule))) fail("execution-budget-escalation");
  return deepFreeze(child);
}

export function createCancellationScope(parent = null) {
  if (parent !== null && (!parent || typeof parent._attach !== "function")) fail("cancellation-parent-invalid");
  let cancelled = false;
  let reason = null;
  const children = new Set();
  const scope = Object.freeze({
    get cancelled() { return cancelled; },
    get reason() { return reason; },
    child() {
      const child = createCancellationScope(scope);
      if (cancelled) child.cancel(reason);
      return child;
    },
    cancel(nextReason = "cancelled") {
      if (cancelled) return false;
      if (typeof nextReason !== "string" || !/^[a-z][a-z0-9-]{0,63}$/.test(nextReason)) fail("cancellation-reason-invalid");
      cancelled = true;
      reason = nextReason;
      for (const child of children) child.cancel(nextReason);
      return true;
    },
    throwIfCancelled() { if (cancelled) fail(`execution-cancelled:${reason}`); },
    _attach(child) { children.add(child); },
  });
  if (parent) parent._attach(scope);
  return scope;
}

function rules(value, code) {
  if (!Array.isArray(value) || value.length > 64 || new Set(value).size !== value.length || value.some((rule) => typeof rule !== "string" || !/^[a-z][a-z0-9-]{0,31}\.[a-z][a-z0-9-]{0,31}$/.test(rule))) fail(code);
}
function exact(value, keys, code) { if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).length !== keys.size || Object.keys(value).some((key) => !keys.has(key))) fail(code); }
function integer(value, min, max, code) { if (!Number.isInteger(value) || value < min || value > max) fail(code); }
function deepFreeze(value) { if (value && typeof value === "object" && !Object.isFrozen(value)) { Object.freeze(value); for (const child of Object.values(value)) deepFreeze(child); } return value; }
function fail(code) { const error = new TypeError(code); error.code = code; throw error; }
