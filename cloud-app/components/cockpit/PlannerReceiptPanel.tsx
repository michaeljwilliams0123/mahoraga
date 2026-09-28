"use client";

import { useCallback, useEffect, useState } from "react";
import { projectObjectivePlannerSurface, type PlannerSurface } from "@/lib/objective-planner-surface";

const EMPTY = projectObjectivePlannerSurface(null);
const short = (value: string | null) => value ? value.slice(0, 12) : "unverified";

function bindLabel(surface: PlannerSurface) {
  if (surface.calibrationBind === "match") return "fingerprint match · content bind verified";
  if (surface.calibrationBind === "mismatch") return "fingerprint mismatch · fail-closed · planner-calibration-profile-fingerprint-mismatch";
  if (surface.calibrationBind === "unbound") return "no calibration fingerprint reported · plannerTrust withheld";
  return "unverified · fail-closed · plannerTrust withheld";
}

export function PlannerReceiptPanel() {
  const [surface, setSurface] = useState<PlannerSurface>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(() => setRevision((current) => current + 1), []);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setSurface(EMPTY);
    void fetch("/api/world-state", { cache: "no-store" })
      .then(async (response) => response.ok ? projectObjectivePlannerSurface(await response.json()) : EMPTY)
      .then((next) => { if (active) setSurface(next); })
      .catch(() => { if (active) setSurface(EMPTY); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [revision]);
  const tone = surface.status === "observed" && surface.calibrationBind !== "mismatch" ? "tone-ok" : "tone-warn";
  const trustShown = surface.calibrationBind === "match" && surface.plannerTrust !== null;
  return (
    <aside className={`cockpit-panel planner-receipt ${tone}`} aria-label="Objective Planner v2 receipts" data-calibration-bind={surface.calibrationBind}>
      <h3>OBJECTIVE_PLANNER_V2</h3>
      <p aria-live="polite">{loading ? "Loading World-State planner receipt…" : surface.status === "observed" ? "Planner receipt structure observed from World-State. Actions below are recommendations." : "Planner receipt unverified; cockpit remains fail-closed."}</p>
      <button type="button" onClick={refresh} disabled={loading} aria-label="Refresh planner receipt">Refresh receipt</button>
      <dl>
        <div><dt>planReceipt.fingerprint</dt><dd><code title={surface.planFingerprint ?? undefined}>{short(surface.planFingerprint)}</code></dd></div>
        <div><dt>planned actions</dt><dd>{surface.actionCount ?? "unverified"}{surface.otherActionCount ? ` · ${surface.otherActionCount} other system actions` : ""}</dd></div>
        <div><dt>dependency HOLD</dt><dd>{surface.hold ? `objective-dependencies-blocked · ${surface.hold.objectiveId} · blockedBy ${surface.hold.blockedBy.join(", ")}` : "none observed"}</dd></div>
        <div><dt>overdue ESCALATE</dt><dd>{surface.escalate ? `objective-overdue · ${surface.escalate.objectiveId ?? "objective unreported"}` : "none observed"}</dd></div>
        <div><dt>ready EXECUTE</dt><dd>{surface.calibrationBind === "mismatch" ? "withheld · fail-closed on fingerprint mismatch" : surface.execute ? `${surface.execute.objectiveId} · ${surface.execute.selectedAlternativeId ?? "no ranked alternative"} · riskAdjustedValue ${surface.execute.riskAdjustedValue ?? "n/a"}${surface.execute.experienceAdjustedValue !== null ? ` · experienceAdjustedValue ${surface.execute.experienceAdjustedValue} · calibrationPenalty ${surface.execute.calibrationPenalty}` : " · no experience-adjusted ranking"}` : "none observed"}</dd></div>
        <div><dt>calibration source</dt><dd>{surface.calibrationSummaryFingerprint ? <code title={surface.calibrationSummaryFingerprint}>{short(surface.calibrationSummaryFingerprint)}</code> : "not reported"}</dd></div>
        <div><dt>calibration bind</dt><dd>{bindLabel(surface)}</dd></div>
        <div><dt>plannerTrust</dt><dd>{trustShown ? surface.plannerTrust : "withheld until verified content bind"}</dd></div>
        <div><dt>replanReceipt</dt><dd>{surface.replan ? `${short(surface.replan.priorPlanFingerprint)} → ${short(surface.replan.newPlanFingerprint)} · ${surface.replan.reasonCode}` : "not reported for this observation"}</dd></div>
      </dl>
      {surface.status === "observed" && <details><summary>Full receipt fingerprints</summary>
        <dl>
          <div><dt>plan</dt><dd><code>{surface.planFingerprint}</code></dd></div>
          {surface.replan && <><div><dt>prior plan</dt><dd><code>{surface.replan.priorPlanFingerprint}</code></dd></div><div><dt>new plan</dt><dd><code>{surface.replan.newPlanFingerprint}</code></dd></div></>}
          {surface.calibrationSummaryFingerprint && <div><dt>calibration summary</dt><dd><code>{surface.calibrationSummaryFingerprint}</code></dd></div>}
        </dl>
      </details>}
      <p className="cockpit-muted">Read-only evidence only. HOLD / ESCALATE / EXECUTE does not grant mutation authority or prove an action ran. plannerTrust is shown only after verified content bind. Fingerprint mismatch fail-closes ranking display. The browser checks receipt structure and provenance links; it cannot independently recompute the plan hash. The planner reports at most one objective per disposition. Mahoraga product name unchanged; 7.0.0-alpha.2 is build provenance only.</p>
    </aside>
  );
}
