import assert from "node:assert/strict";
import { isClaimableTask, isLeaseExpiredQueuedRetry, isLeaseExpiredTerminal, leaseExpiredLabel } from "../lib/task-lease-state.ts";

const exhausted = { status: "failed", errorCode: "lease-expired" };
const retry = { status: "queued", errorCode: "lease-expired" };
const fresh = { status: "queued", errorCode: null };

assert.equal(isLeaseExpiredTerminal(exhausted), true);
assert.equal(isClaimableTask(exhausted), false);
assert.equal(leaseExpiredLabel(exhausted), "Failed · lease-expired · not claimable");

assert.equal(isLeaseExpiredQueuedRetry(retry), true);
assert.equal(isClaimableTask(retry), true);
assert.equal(leaseExpiredLabel(retry), "Queued · lease-expired · retry remaining");

assert.equal(isLeaseExpiredTerminal(fresh), false);
assert.equal(isClaimableTask(fresh), true);
assert.equal(leaseExpiredLabel(fresh), null);
