import test from "node:test";
import assert from "node:assert/strict";
import {
  createDeploymentAnchor,
  getAnchoredFourHourWindowStart,
  getCycleWindowEpoch,
} from "../src/sovereign-cycle-clock.mjs";

test("deployment anchor starts exactly ten minutes after release completion", () => {
  assert.equal(
    createDeploymentAnchor("2026-09-04T16:35:26.000Z"),
    "2026-09-04T16:45:26.000Z",
  );
});

test("anchored four-hour cadence stays aligned to the deployment anchor", () => {
  const anchor = "2026-09-04T16:45:26.000Z";
  assert.equal(getAnchoredFourHourWindowStart("2026-09-04T16:45:26.000Z", anchor), anchor);
  assert.equal(getAnchoredFourHourWindowStart("2026-09-04T20:45:25.999Z", anchor), anchor);
  assert.equal(
    getAnchoredFourHourWindowStart("2026-09-04T20:45:26.000Z", anchor),
    "2026-09-04T20:45:26.000Z",
  );
  assert.equal(getAnchoredFourHourWindowStart("2026-09-04T16:45:25.999Z", anchor), null);
});

test("window epoch is deterministic for durable completion tags", () => {
  assert.equal(getCycleWindowEpoch("2026-09-04T20:45:26.000Z"), 1788554726);
});
