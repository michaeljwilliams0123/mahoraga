import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
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
    assert.match(view,/PlannerReceiptPanel/); assert.match(command,/PlannerReceiptPanel/);
    assert.match(route,/coreRequest\("world-state"\)/); assert.match(route,/cache-control/);
  });
});
