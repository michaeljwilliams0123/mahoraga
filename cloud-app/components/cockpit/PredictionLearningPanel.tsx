"use client";

import { projectPredictionLearningSurface } from "@/lib/prediction-learning-surface";

const short=(value:string|null)=>value?value.slice(0,12):"unverified";
export function PredictionLearningPanel({ snapshot }:{ snapshot:unknown }) {
  const learning=projectPredictionLearningSurface(snapshot);
  const tone=learning.status==="observed"?"tone-ok":learning.status==="hold"?"tone-warn":"tone-neutral";
  return (
    <aside className={`cockpit-panel ${tone}`} aria-label="Prediction calibration learning loop">
      <h3>PREDICTION_CALIBRATION_LOOP</h3>
      <p>{learning.status==="observed"?"Verified prediction→outcome→calibration→institutional-learning→planner feedback observed.":"Closed-loop capability is canonical, but live evidence is incomplete or absent; planner trust remains fail-closed."}</p>
      <dl>
        <div><dt>cycle → prediction receipt</dt><dd>{short(learning.cycleFingerprint)} → {short(learning.predictionReceiptFingerprint)}</dd></div>
        <div><dt>sampleCount</dt><dd>{learning.sampleCount ?? "unverified"}</dd></div>
        <div><dt>plannerTrust</dt><dd>{learning.plannerTrust ?? "unverified"}</dd></div>
        <div><dt>evidenceSufficient</dt><dd>{learning.evidenceSufficient ? "true" : "false · HOLD"}</dd></div>
        <div><dt>meanCalibrationGap</dt><dd>{learning.meanCalibrationGap ?? "unverified"}</dd></div>
        <div><dt>institutional promotion class</dt><dd>{learning.promotionClass ?? "unverified"}</dd></div>
        <div><dt>experience-adjusted ranking</dt><dd>{learning.experienceAdjustedValue ?? "unverified"}</dd></div>
      </dl>
      <p className="cockpit-muted">{learning.reason}. This surface grants no execution or mutation authority and does not promote Cloudflare-native /predict.</p>
    </aside>
  );
}
