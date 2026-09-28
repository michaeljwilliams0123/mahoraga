import test from "node:test";
import assert from "node:assert/strict";
import { eligibleWorkerRoutes, issueRouteLease, selectWorkerRoute, validateHandoff, validateWorkerAttestation } from "../src/universal-execution-broker.mjs";

const NOW = new Date("2026-09-28T21:40:00.000Z");
const iso = (ms) => new Date(NOW.getTime() + ms).toISOString();
const cap = (o={}) => ({ capability:"repository.inspect", permissionClass:"read", healthy:true, zeroCreditEligible:true, costClass:"zero-credit", dataClassesAllowed:["synthetic","personal","enterprise"], authorityScopes:["repo:mahoraga:read"], ...o });
const att = (o={}) => ({ schemaVersion:1, kind:"universal-worker-attestation", workerId:"github-primary", provider:"github", locality:"cloud", observedAt:iso(-5000), expiresAt:iso(55000), observedLatencyMs:30, queueDepth:0, reliabilityScore:.99, capabilities:[cap()], ...o });
const req = (o={}) => ({ schemaVersion:1, taskId:"task-1", chainId:"chain-1", requiredCapability:"repository.inspect", requestedPermission:"read", dataClass:"enterprise", authorityScopes:["repo:mahoraga:read"], costPreference:"zero-credit-first", maxHops:6, constraints:{}, evidenceRefs:[], ...o });

test("attestation validation fails closed", () => {
  assert.equal(validateWorkerAttestation(att(), NOW).ok, true);
  assert.equal(validateWorkerAttestation(att({expiresAt:iso(-1)}), NOW).reason, "attestation-stale");
  assert.equal(validateWorkerAttestation(att({observedAt:iso(30000)}), NOW).reason, "attestation-future");
  assert.equal(validateWorkerAttestation(att({expiresAt:iso(600000)}), NOW).reason, "attestation-overlong");
  assert.equal(validateWorkerAttestation({hello:"world"}, NOW).reason, "attestation-malformed");
});

test("eligibility enforces health permission authority data locality cost and duplicate evidence", () => {
  assert.equal(eligibleWorkerRoutes(req(), [att()], NOW).length, 1);
  assert.equal(eligibleWorkerRoutes(req(), [att({capabilities:[cap({healthy:false})]})], NOW).length, 0);
  assert.equal(eligibleWorkerRoutes(req({requestedPermission:"write"}), [att()], NOW).length, 0);
  assert.equal(eligibleWorkerRoutes(req({authorityScopes:["repo:other:read"]}), [att()], NOW).length, 0);
  assert.equal(eligibleWorkerRoutes(req({dataClass:"local-only"}), [att()], NOW).length, 0);
  assert.equal(eligibleWorkerRoutes(req({constraints:{requireZeroCredit:true}}), [att({capabilities:[cap({zeroCreditEligible:false,costClass:"licensed-cloud"})]})], NOW).length, 0);
  assert.equal(eligibleWorkerRoutes(req(), [att(), att()], NOW).length, 0);
});

test("selection prefers zero-credit then locality latency reliability queue and stable id", () => {
  assert.equal(selectWorkerRoute(req(), [att({workerId:"slow", observedLatencyMs:100}), att({workerId:"fast", observedLatencyMs:10})], NOW).selected.workerId, "fast");
  const paidFast = att({workerId:"paid-fast", observedLatencyMs:1, capabilities:[cap({zeroCreditEligible:false,costClass:"licensed-cloud"})]});
  assert.equal(selectWorkerRoute(req(), [paidFast, att({workerId:"zero",observedLatencyMs:100})], NOW).selected.workerId, "zero");
  const local = att({workerId:"local", locality:"local", observedLatencyMs:50, capabilities:[cap({dataClassesAllowed:["local-only"]})]});
  assert.equal(selectWorkerRoute(req({dataClass:"local-only"}), [local, att({workerId:"cloud",locality:"cloud",capabilities:[cap({dataClassesAllowed:["local-only"]})]})], NOW).selected.workerId, "local");
});

test("lease preserves bounded route identity", () => {
  const selected = selectWorkerRoute(req(), [att()], NOW).selected;
  const lease = issueRouteLease(req(), selected, NOW);
  assert.deepEqual({taskId:lease.taskId,chainId:lease.chainId,capability:lease.capability,workerId:lease.workerId,provider:lease.provider,authorityScopes:lease.authorityScopes}, {taskId:"task-1",chainId:"chain-1",capability:"repository.inspect",workerId:"github-primary",provider:"github",authorityScopes:["repo:mahoraga:read"]});
  assert.ok(Date.parse(lease.expiresAt) > NOW.getTime());
  assert.match(lease.routeLeaseId, /^lease-[a-f0-9]{16}$/);
  assert.match(lease.selectionReceiptId, /^sel-[a-f0-9]{16}$/);
});

test("handoff narrows authority and terminates expansion deadlines loops and hop overflow", () => {
  const base = req({requestedPermission:"write",authorityScopes:["repo:mahoraga:read","repo:mahoraga:write"]});
  const h = {schemaVersion:1,taskId:"task-1",chainId:"chain-1",fromWorkerId:"repo-worker",requiredNextCapability:"repository.verify",requestedPermission:"read",remainingObjective:"verify",evidenceRefs:["ev-1"],receiptRefs:["rcpt-1"],authorityScopes:["repo:mahoraga:read"],visitedWorkers:["repo-worker"],hopCount:1};
  const ok = validateHandoff(base,h,[],NOW); assert.equal(ok.ok,true); assert.deepEqual(ok.request.authorityScopes,["repo:mahoraga:read"]);
  assert.equal(validateHandoff(base,{...h,requestedPermission:"contained"},[],NOW).reason,"authority-scope-mismatch");
  assert.equal(validateHandoff(base,{...h,authorityScopes:["admin:*"]},[],NOW).reason,"authority-scope-mismatch");
  assert.equal(validateHandoff({...base,deadlineAt:iso(-1)},h,[],NOW).reason,"execution-deadline-exceeded");
  assert.equal(validateHandoff({...base,maxHops:1},h,[],NOW).reason,"handoff-hop-limit");  assert.equal(validateHandoff(base,{...h,requiredNextCapability:"repository.inspect"},[{workerId:"repo-worker",capability:"repository.inspect",errorFingerprint:"same"}],NOW).reason,"handoff-loop-detected");
  assert.equal(validateHandoff(base,{...h,errorFingerprint:"boom"},[{workerId:"a",capability:"x",errorFingerprint:"boom"},{workerId:"b",capability:"y",errorFingerprint:"boom"}],NOW).reason,"handoff-loop-detected");
});

test("no eligible route is explicit", () => {
  assert.deepEqual(selectWorkerRoute(req(),[],NOW),{ok:false,reason:"no-eligible-route",eligible:[]});
});