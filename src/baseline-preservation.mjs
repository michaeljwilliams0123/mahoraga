const SHA = /^[a-f0-9]{40}$/i;
const SAFE_PATH = /^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))[A-Za-z0-9][A-Za-z0-9._+/-]*$/;

export function inspectBaselinePreservation({ baseSha, headSha, changes } = {}) {
  if (!SHA.test(String(baseSha ?? "")) || !SHA.test(String(headSha ?? ""))) {
    throw Object.assign(new TypeError("baseline-sha-invalid"), { code: "baseline-sha-invalid" });
  }
  if (!Array.isArray(changes)) {
    throw Object.assign(new TypeError("baseline-changes-invalid"), { code: "baseline-changes-invalid" });
  }
  const violations = [];
  for (const change of changes) {
    const path = change?.path;
    if (typeof path !== "string" || !SAFE_PATH.test(path)) {
      throw Object.assign(new TypeError("baseline-path-invalid"), { code: "baseline-path-invalid" });
    }
    if (change.status === "removed") {
      violations.push({ code: "baseline-file-removed", path });
    } else if (change.status === "renamed") {
      violations.push({ code: "baseline-file-renamed", path, previousPath: change.previousPath ?? null });
    }
  }
  return {
    ok: violations.length === 0,
    violations,
    preservationMode: "additive-no-delete-rename",
    baseSha,
    headSha,
  };
}

export function assertAdditiveBaseline(input) {
  const result = inspectBaselinePreservation(input);
  if (!result.ok) {
    throw Object.assign(new Error("baseline-preservation-violation"), {
      code: "baseline-preservation-violation",
      violations: result.violations,
    });
  }
  return result;
}
