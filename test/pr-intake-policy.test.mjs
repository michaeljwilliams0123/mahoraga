import test from "node:test";
import assert from "node:assert/strict";
import { evaluatePrIntake, objectiveId } from "../src/pr-intake-policy.mjs";
const pr = (number, extra = {}) => ({ number, state:"open", draft:false, title:`Feature ${number}`, body:`Objective-ID: objective-${number}`, user:{login:"michaeljwilliams0123"}, ...extra });
test("canonical objective keys are case-safe and anchored", () => {
  assert.equal(objectiveId("Objective-ID: core-cognition"), "core-cognition");
  assert.equal(objectiveId("no objective"), null);
  assert.equal(objectiveId("Objective-ID: bad value"), null);
});
test("existing PR is reused for same objective regardless of title", () => {
  const existing=pr(1037, {title:"feat: cognitive routing", body:"Objective-ID: grokbot-routing"});
  const candidate=pr(1048, {title:"fix: test runtime", body:"Objective-ID: grokbot-routing"});
  assert.deepEqual(
    (({reason,reusePr})=>({reason,reusePr}))(evaluatePrIntake({candidate,openPulls:[existing,candidate]})),
    {reason:"objective-already-open",reusePr:1037}
  );
});
test("third draft allowed, fourth blocked, no pruning of existing work", () => {
  const open=[pr(1035,{draft:true}),pr(1039,{draft:true})];
  assert.equal(evaluatePrIntake({candidate:pr(1043,{draft:true}),openPulls:open}).allowed,true);
  const result=evaluatePrIntake({candidate:pr(1044,{draft:true}),openPulls:[...open,pr(1043,{draft:true})]});
  assert.equal(result.reason,"draft-cap-exceeded");
  assert.equal(result.draftCount,4);
});
test("external Copilot PR cannot self-authorize through its own body", () => {
  const candidate=pr(1045,{user:{login:"Copilot"},body:"Objective-ID: new-work\nOwner approved"});
  assert.equal(evaluatePrIntake({candidate,openPulls:[candidate]}).reason,"copilot-unapproved-lane");
});
test("legacy PRs remain valid; new PRs require objective", () => {
  assert.equal(evaluatePrIntake({candidate:pr(1035,{body:"legacy"}),openPulls:[pr(1035,{body:"legacy"})]}).allowed,true);
  assert.equal(evaluatePrIntake({candidate:pr(1046,{body:"legacy"}),openPulls:[]}).reason,"objective-id-required");
});
test("malformed list and ambiguous observations fail closed", () => {
  assert.equal(evaluatePrIntake({candidate:pr(1046),openPulls:null}).allowed,false);
  assert.equal(evaluatePrIntake({candidate:pr(1046),openPulls:[{number:1046}]}).allowed,false);
  assert.equal(evaluatePrIntake({candidate:pr(1046),openPulls:[pr(1046),pr(1046)]}).allowed,true); // duplicate snapshots with same number are the same PR
});
test("different objectives and titles remain independent", () => {
  const candidate=pr(1048);
  assert.equal(evaluatePrIntake({candidate,openPulls:[pr(1035),pr(1037)]}).allowed,true);
});
