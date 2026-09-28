"use client";

import { useEffect, useState } from "react";
import { projectObjectivePlannerSurface, type PlannerSurface } from "@/lib/objective-planner-surface";

const EMPTY = projectObjectivePlannerSurface(null);
const short = (value: string | null) => value ? value.slice(0, 12) : "unverified";

export function PlannerReceiptPanel() {
  const [surface, setSurface] = useState<PlannerSurface>(EMPTY);
  useEffect(() => {
    let active = true;
    void fetch("/api/world-state", { cache: "no-store" })
      .then(async (response) => response.ok ? projectObjectivePlannerSurface(await response.json()) : EMPTY)
      .then((next) => { if (active) setSurface(next); })
      .catch(() => { if (active) setSurface(EMPTY); });
    return () => { active = false; };
  }, []);
  const tone = surface.status === "observed" ? "tone-ok" : "tone-warn";
  return (
    <aside className={`cockpit-panel ${tone}`} aria-label="Objective Planner v2 receipts">
      <h3>OBJECTIVE_PLANNER_V2</h3>
      <p>{surface.status === "observed" ? "Observed read-only planner receipt from World-State." : "Planner receipt unverified; cockpit remains fail-closed."}</p>
      <dl>
        <div><dt>planReceipt.fingerprint</dt><dd>{short(surface.planFingerprint)}</dd></div>
        <div><dt>dependency HOLD</dt><dd>{surface.hold ? `objective-dependencies-blocked · blockedBy ${surface.hold.blockedBy.join(", ") || "unreported"}` : "none observed"}</dd></div>
        <div><dt>overdue ESCALATE</dt><dd>{surface.escalate ? `objective-overdue · ${surface.escalate.objectiveId ?? "objective unreported"}` : "none observed"}</dd></div>
        <div><dt>ready EXECUTE</dt><dd>{surface.execute ? `${surface.execute.selectedAlternativeId ?? "alternative unreported"} · riskAdjustedValue ${surface.execute.riskAdjustedValue ?? "n/a"}${surface.execute.experienceAdjustedValue !== null ? ` · experienceAdjustedValue ${surface.execute.experienceAdjustedValue}` : ""}` : "none observed"}</dd></div>
        <div><dt>replanReceipt</dt><dd>{surface.replan ? `${short(surface.replan.priorPlanFingerprint)} → ${short(surface.replan.newPlanFingerprint)} · ${surface.replan.reasonCode}` : "none observed"}</dd></div>
      </dl>
      <p className="cockpit-muted">Read-only evidence only. HOLD / ESCALATE / EXECUTE does not grant mutation authority; malformed or missing receipts stay unverified.</p>
    </aside>
  );
}
