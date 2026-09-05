import test from "node:test";
import assert from "node:assert/strict";
import { assertAdditiveBaseline, inspectBaselinePreservation } from "../src/baseline-preservation.mjs";

const baseSha = "a".repeat(40);
const headSha = "b".repeat(40);

test("baseline preservation admits additive and modifying changes", () => {
  const result = inspectBaselinePreservation({
    baseSha,
    headSha,
    changes: [
      { status: "added", path: "src/new-capability.mjs" },
      { status: "modified", path: "src/existing-capability.mjs" },
    ],
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.violations, []);
  assert.equal(result.preservationMode, "additive-no-delete-rename");
});

test("baseline preservation rejects removals and renames", () => {
  const result = inspectBaselinePreservation({
    baseSha,
    headSha,
    changes: [
      { status: "removed", path: "cloud-app/grok-preserved.tsx" },
      { status: "renamed", path: "operator-deck/legacy.tsx", previousPath: "operator-deck/grok.tsx" },
    ],
  });
  assert.equal(result.ok, false);
  assert.deepEqual(result.violations.map((item) => item.code), ["baseline-file-removed", "baseline-file-renamed"]);
  assert.throws(
    () => assertAdditiveBaseline({ baseSha, headSha, changes: [{ status: "removed", path: "README.md" }] }),
    (error) => error?.code === "baseline-preservation-violation",
  );
});

test("baseline preservation validates commit and change metadata", () => {
  assert.throws(() => inspectBaselinePreservation({ baseSha: "main", headSha, changes: [] }), /baseline-sha-invalid/);
  assert.throws(() => inspectBaselinePreservation({ baseSha, headSha, changes: [{ status: "modified", path: "../escape" }] }), /baseline-path-invalid/);
});
