import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { projectObjectivePlannerSurface } from "../lib/objective-planner-surface.ts";
import { planWorldStateActions } from "../../src/objective-planner.mjs";
const root=join(dirname(fileURLToPath(import.meta.url)),"..");
const surface=readFileSync(join(root,"lib/objective-planner-surface.ts"),"utf8");
const panel=readFileSync(join(root,"components/cockpit/PlannerReceiptPanel.tsx"),"utf8");
const view=readFileSync(join(root,"components/cockpit/CockpitView.tsx"),"utf8");
const command=readFileSync(join(root,"components/cockpit/CommandCockpit.tsx"),"utf8");
const route=readFileSync(join(root,"app/api/world-state/route.ts"),"utf8");
describe("Objective Planner v2 cockpit evidence",()=>{
  it("projects the existing HOLD ESCALATE EXECUTE and replan contracts fail-closed",()=>{
    for(const token of ["objective-dependencies-blocked","objective-overdue","objective-ready","selectedAlternativeId","riskAdjustedValue","experienceAdjustedValue","priorPlanFingerprint","newPlanFingerprint","planner-receipt-unverified"]) assert.match(surface,new RegExp(token));
    assert.match(surface,/SHA256/);
  });
  it("renders the read-only world-state receipt on both existing cockpit surfaces",()=>{
    assert.match(panel,/OBJECTIVE_PLANNER_V2/); assert.match(panel,/planReceipt\.fingerprint/); assert.match(panel,/Read-only evidence only/);
    assert.match(panel,/Full receipt fingerprints/); assert.match(panel,/Refresh receipt/);
    assert.match(view,/PlannerReceiptPanel/); assert.match(command,/PlannerReceiptPanel/);
    assert.match(route,/coreRequest\("world-state"\)/); assert.match(route,/cache-control/);
  });
  const now=Date.parse("2026-09-27T20:00:00Z");
  const base={workers:[],activeLeases:[],taskCounts:{},repository:{verified:true},providers:[]};
  const plan=(objectives,options={})=>planWorldStateActions({...base,objectives},{now,...options});
  const observed=(planner)=>projectObjectivePlannerSurface({planner});
  it("projects real HOLD, ESCALATE, EXECUTE, calibration, and replan evidence",()=>{
    const initial=plan([{id:"foundation",status:"pending"}]);
    const calibrationCore={schemaVersion:1,kind:"prediction-calibration-summary",sampleCount:3,meanObservedAccuracy:0.8,meanPredictedConfidence:0.8,meanCalibrationGap:0.1,meanNormalizedError:0.2,plannerTrust:0,evidenceSufficient:true,sourceFingerprints:["1".repeat(64),"2".repeat(64),"3".repeat(64)]};
    const calibrationProfile={...calibrationCore,fingerprint:createHash("sha256").update(JSON.stringify(calibrationCore)).digest("hex")};
    const planner=plan([
      {id:"foundation",status:"running"},
      {id:"dependent",status:"pending",dependsOn:["foundation"]},
      {id:"expired",status:"pending",deadline:"2026-09-26T00:00:00Z"},
      {id:"ready",status:"pending",alternatives:[{id:"fast",expectedValue:0.95,risk:0.2},{id:"safe",expectedValue:0.8,risk:0.1}]},
    ],{calibrationProfile,priorPlanFingerprint:initial.planReceipt.fingerprint,replanTrigger:"world-state-changed"});
    const surface=observed(planner);
    assert.equal(surface.status,"observed");
    assert.equal(surface.actionCount,3);
    assert.deepEqual(surface.hold,{objectiveId:"dependent",blockedBy:["foundation"]});
    assert.deepEqual(surface.escalate,{objectiveId:"expired"});
    assert.equal(surface.execute.objectiveId,"ready");
    assert.equal(surface.execute.selectedAlternativeId,"safe");
    assert.equal(surface.execute.riskAdjustedValue,0.7);
    assert.equal(surface.execute.experienceAdjustedValue,0.6);
    assert.equal(surface.execute.calibrationSummaryFingerprint,calibrationProfile.fingerprint);
    assert.equal(surface.replan.newPlanFingerprint,surface.planFingerprint);
    assert.equal(surface.replan.priorPlanFingerprint,initial.planReceipt.fingerprint);
  });
  it("reports a stable plan with no actions and no implied execution",()=>{
    const surface=observed(plan([]));
    assert.equal(surface.status,"observed");
    assert.equal(surface.actionCount,0);
    assert.equal(surface.execute,null);
    assert.equal(surface.replan,null);
  });
  it("fails closed on contradictory counts, provenance, authority or objective evidence",()=>{
    const original=plan([{id:"ready",status:"pending",alternatives:[{id:"safe",expectedValue:0.8,risk:0.1}]}]);
    const action=original.actions[0];
    for(const tampered of [
      {...original,actionCount:2},
      {...original,automaticMutationAllowed:true},
      {...original,replanReceipt:{priorPlanFingerprint:"a".repeat(64),newPlanFingerprint:"c".repeat(64),reasonCode:"changed"}},
      {...original,actions:[{...action,mutation:true}]},
      {...original,actions:[{...action,evidence:{...action.evidence,objectiveId:null}}]},
      {...original,actions:[{...action,evidence:{...action.evidence,experienceAdjustedValue:0.5,calibrationPenalty:0.2,calibrationSummaryFingerprint:"b".repeat(64)}}]},
      {...original,actions:[null]},
    ]){
      const surface=observed(tampered);
      assert.equal(surface.status,"unverified");
      assert.equal(surface.execute,null);
      assert.equal(surface.planFingerprint,null);
    }
  });
});
