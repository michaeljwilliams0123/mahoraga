import assert from "node:assert/strict";
import test from "node:test";

import { projectHardZeroHold } from "../lib/hard-zero-hold.ts";

test("no receipt leaves hold provenance unobserved", () => {
  assert.deepEqual(projectHardZeroHold(null), { status: "unobserved", heldUtcDay: null, heldResumeAt: null });
});

test("observed hold includes the original UTC day and its canonical reset boundary", () => {
  assert.deepEqual(projectHardZeroHold({ nextAction: "quota-hold-until-utc-reset", heldUtcDay: "2026-09-26", heldResumeAt: "2026-09-27T00:00:00.000Z" }), {
    status: "observed", heldUtcDay: "2026-09-26", heldResumeAt: "2026-09-27T00:00:00.000Z",
  });
});

test("malformed or missing provenance never represents a queued resume as verified", () => {
  for (const [day, resume] of [
    [undefined, undefined],
    ["2026-02-30", "2026-03-01T00:00:00.000Z"],
    ["2026-09-26", "2026-09-28T00:00:00.000Z"],
    ["2026-09-26", "2026-09-27T00:00:00+00:00"],
  ]) {
    assert.deepEqual(projectHardZeroHold({ nextAction: "resume-queued", heldUtcDay: day, heldResumeAt: resume }), {
      status: "unverified", heldUtcDay: null, heldResumeAt: null,
    });
  }
});

test("a non-hold action cannot imply an observed hold", () => {
  assert.equal(projectHardZeroHold({ nextAction: "dispatch-hard-zero", heldUtcDay: "2026-09-26", heldResumeAt: "2026-09-27T00:00:00.000Z" }).status, "unobserved");
});
