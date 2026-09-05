import test from "node:test";
import assert from "node:assert/strict";
import { classifyOpenPullRequest, reduceStalePullRequestLedger } from "../src/stale-pr-ledger.mjs";

const MAIN = "b".repeat(40);
const OLD = "a".repeat(40);

test("ledger-only cycle refresh PRs with a stale base are close-eligible at $0", () => {
  const stale = classifyOpenPullRequest({
    number: 160,
    state: "open",
    title: "chore: refresh sovereign cycle outcome ledger",
    files: ["reports/sovereign-cycle-outcome.json"],
    baseSha: OLD,
    currentMainSha: MAIN,
  });
  assert.equal(stale.disposition, "close-eligible");
  assert.equal(stale.reason, "cycle-ledger-noop-stale");
  assert.equal(stale.creditCost, 0);
  assert.equal(stale.paidFallback, false);
});

test("implementation PRs stay open even when the base has moved", () => {
  const keep = classifyOpenPullRequest({
    number: 161,
    state: "open",
    title: "fix: make Vercel non-blocking for main protection",
    files: ["config/main-protection.contract.json", "src/github-live-protection.mjs"],
    baseSha: OLD,
    currentMainSha: MAIN,
  });
  assert.equal(keep.disposition, "keep");
  assert.equal(keep.reason, "implementation-or-active");
});

test("ledger counts stay credit-free", () => {
  const ledger = reduceStalePullRequestLedger([
    {
      number: 160,
      state: "open",
      title: "chore: refresh sovereign cycle outcome ledger",
      files: ["reports/sovereign-cycle-outcome.json"],
      baseSha: OLD,
      currentMainSha: MAIN,
    },
    {
      number: 83,
      state: "closed",
      title: "already closed",
      files: ["reports/sovereign-cycle-outcome.json"],
    },
  ], { evaluatedAt: "2026-09-05T17:10:00.000Z" });
  assert.equal(ledger.counts["close-eligible"], 1);
  assert.equal(ledger.counts.keep, 1);
  assert.equal(ledger.creditCost, 0);
  assert.equal(ledger.paidFallback, false);
});
