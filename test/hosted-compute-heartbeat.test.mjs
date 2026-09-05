import test from "node:test";
import assert from "node:assert/strict";
import {
  hostedComputeFromLedgerText,
  readCreditFreeRuntime,
  runCreditFreeHeartbeatFromEnv,
} from "../src/autonomy-heartbeat.mjs";

const NOW = new Date("2026-09-05T08:00:00.000Z");

test("unattended heartbeat observes hosted-compute exhaustion instead of defaulting to dispatch", () => {
  const marker = hostedComputeFromLedgerText('Resource is limited (more than 100, code: "api-deployments-free-per-day").');
  assert.equal(marker.vercelDeploymentsToday, 100);
  assert.equal(marker.vercelDailyCap, 100);
  assert.equal(hostedComputeFromLedgerText("healthy preview").vercelDeploymentsToday, 0);

  const runtime = readCreditFreeRuntime({
    MAHORAGA_HOSTED_LEDGER_TEXT: 'code: "api-deployments-free-per-day"',
    GITHUB_SHA: "a".repeat(40),
    MAHORAGA_OPEN_ISSUES: "2",
    MAHORAGA_OPEN_PULLS: "0",
  });
  assert.equal(runtime.vercelDeploymentsToday, 100);
  assert.equal(runtime.world.openIssues, 2);
  assert.equal(runtime.world.openPulls, 0);

  const held = runCreditFreeHeartbeatFromEnv({
    now: NOW,
    env: {
      MAHORAGA_HOSTED_LEDGER_TEXT: 'code: "api-deployments-free-per-day"',
      GITHUB_SHA: "a".repeat(40),
    },
  });
  assert.equal(held.nextAction, "hold-planned");
  assert.equal(held.executable, false);
  assert.equal(held.paidFallback, false);
  assert.equal(held.hostedCompute.reason, "hosted-deploy-cap-exhausted");
});
