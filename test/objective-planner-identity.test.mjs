import test from "node:test";
import assert from "node:assert/strict";
import { planWorldStateActions } from "../src/objective-planner.mjs";
const now=Date.parse("2026-10-10T16:00:00Z");
const snapshot=objectives=>({workers:[],activeLeases:[],taskCounts:{},repository:{verified:true},providers:[],objectives});
test("planner refuses duplicate objective identifiers before issuing execution action",()=>{
 assert.throws(()=>planWorldStateActions(snapshot([{id:"foundation",status:"completed"},{id:"foundation",status:"pending"}]),{now}),/planner-objective-id-duplicate/);
});
test("planner refuses ambiguous empty identifiers rather than synthesizing an unknown objective",()=>{
 for(const id of ["","  ",null,undefined]){
 assert.throws(()=>planWorldStateActions(snapshot([{id,status:"pending"}]),{now}),/planner-objective-id-invalid/);
 }
});
test("planner preserves deterministic actions for valid unique dependencies",()=>{
 const plan=planWorldStateActions(snapshot([{id:"one",status:"completed"},{id:"two",status:"pending",dependsOn:["one"]}]),{now});
 assert.equal(plan.actions.find(x=>x.evidence?.objectiveId==="two")?.disposition,"execute");
});
