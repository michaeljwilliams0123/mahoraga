// Deterministic routing projection. Does not allocate compute or grant authority.
// Actions workflow job-level guards are authoritative for runner allocation.
export const EXECUTION_ROUTES = Object.freeze(["auto", "cloud", "local", "hold"]);
export const LOCAL_WINDOWS_LABELS = Object.freeze(["self-hosted", "windows", "x64", "mahoraga", "zero-credit"]);

export function resolveExecutionRoute({ requestedMode = "", repositoryPrivate, privateStewardEnabled = false, localRunnerReady = false } = {}) {
  if (typeof repositoryPrivate !== "boolean") throw new TypeError("Repository visibility must be verified.");
  const mode = requestedMode === "" || requestedMode === undefined ? "auto" : requestedMode;
  const valid = EXECUTION_ROUTES.includes(mode);
  const stewardCloud = valid && !repositoryPrivate && (mode === "auto" || mode === "cloud");
  const stewardLocal = valid && repositoryPrivate && privateStewardEnabled && (mode === "auto" || mode === "local");
  const sovereignLocal = valid && (mode === "auto" || (mode === "local" && repositoryPrivate));
  const lane = (selected) => ({
    selected,
    state: selected === "held" ? "held" : selected === "local-windows" && !localRunnerReady ? "queued-until-runner-online" : "eligible",
    ...(selected === "local-windows" ? { requiredLabels: [...LOCAL_WINDOWS_LABELS] } : {}),
  });
  return Object.freeze({
    mode: valid ? mode : "invalid",
    repositoryPrivate,
    steward: lane(stewardCloud ? "public-hosted-ubuntu" : stewardLocal ? "local-windows" : "held"),
    sovereign: lane(sovereignLocal ? "local-windows" : "held"),
    privateStewardEnabled,
    localRunnerReady,
    paidFallback: false,
    automaticVisibilityChange: false,
    automaticCredentialOrRegistrationChange: false,
  });
}
