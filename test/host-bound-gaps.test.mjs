import test from "node:test";
import assert from "node:assert/strict";
import { classifyHostBoundGap, nextCreditFreeIssueAction, HOST_BOUND_GAPS } from "../src/host-bound-gaps.mjs";

test("host-bound gaps hold at $0 and are not close-eligible", () => {
  assert.ok(HOST_BOUND_GAPS.length >= 7);
  for (const gap of HOST_BOUND_GAPS) {
    const classified = classifyHostBoundGap({ issueNumber: gap.issue });
    assert.equal(classified.kind, "host-bound", gap.id);
    assert.equal(classified.hold, true);
    assert.equal(classified.closeEligible, false);
    assert.equal(classified.action, "hold-host-bound");
    assert.equal(classified.creditCost, 0);
    assert.equal(classified.paidFallback, false);
    assert.equal(classified.reason, gap.reason);
  }
});

test("unknown issues stay repo-closeable inspect, never a paid probe", () => {
  const classified = classifyHostBoundGap({ issueNumber: 999, title: "ordinary repo defect" });
  assert.equal(classified.kind, "repo-closeable");
  assert.equal(classified.hold, false);
  assert.equal(classified.action, "inspect");
  assert.equal(classified.creditCost, 0);
  assert.equal(nextCreditFreeIssueAction({ issueNumber: 208 }).action, "hold-host-bound");
  assert.equal(nextCreditFreeIssueAction({ issueNumber: 1 }).action, "inspect");
});

test("Vercel duplicate retirement is not an invitation to create a project", () => {
  const vercel = classifyHostBoundGap({ issueNumber: 208 });
  assert.equal(vercel.reason, "operator-cannot-see-canonical-or-duplicates");
  assert.match(vercel.summary, /not authority to create/i);
});
