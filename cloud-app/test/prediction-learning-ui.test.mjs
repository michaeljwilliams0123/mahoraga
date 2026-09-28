import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe,it } from "node:test";
import { dirname,join } from "node:path";
import { fileURLToPath } from "node:url";
const root=join(dirname(fileURLToPath(import.meta.url)),"..");
const surface=readFileSync(join(root,"lib/prediction-learning-surface.ts"),"utf8");
const panel=readFileSync(join(root,"components/cockpit/PredictionLearningPanel.tsx"),"utf8");
const cockpit=readFileSync(join(root,"components/cockpit/CockpitView.tsx"),"utf8");
const command=readFileSync(join(root,"components/cockpit/CommandCockpit.tsx"),"utf8");
const chat=readFileSync(join(root,"components/workspace/chat-view.tsx"),"utf8");
const connections=readFileSync(join(root,"components/workspace/connections-view.tsx"),"utf8");
const types=readFileSync(join(root,"components/workspace/workspace-types.ts"),"utf8");
describe("prediction learning UI",()=>{
 it("requires complete empirical calibration evidence before observed status",()=>{
   for(const token of ["cycleFingerprint","predictionReceiptFingerprint","sampleCount","plannerTrust","evidenceSufficient","meanCalibrationGap","prediction-learning-promotion","memoryClass","calibrationSummaryFingerprint","experienceAdjustedValue","prediction-learning-evidence-insufficient"]) assert.match(surface,new RegExp(token));
   assert.match(surface,/plannerCalibrationFingerprint===calibrationFingerprint/);
 });
 it("surfaces the closed loop without claiming Cloudflare predictive promotion",()=>{
   for(const token of ["PREDICTION_CALIBRATION_LOOP","cycle → prediction receipt","institutional promotion class","experience-adjusted ranking","does not promote Cloudflare-native \/predict"]) assert.match(panel,new RegExp(token));
   assert.match(cockpit,/PredictionLearningPanel/); assert.match(command,/PredictionLearningPanel/); assert.match(types,/predictionLearning\?: unknown/);
   assert.match(chat,/closed-loop calibration is canonical; live learning evidence is receipt-gated/);
   assert.match(connections,/prediction→outcome→calibration→institutional learning→planner feedback is canonical; live metrics remain receipt-gated/);
 });
});
