export type HoldObservation = {
  status: "observed" | "unverified" | "unobserved";
  heldUtcDay: string | null;
  heldResumeAt: string | null;
};

/** Display-only provenance check. Execution admission remains with the core. */
export function projectHardZeroHold(receipt: {
  nextAction?: string;
  heldUtcDay?: string | null;
  heldResumeAt?: string | null;
} | null): HoldObservation {
  const empty = { heldUtcDay: null, heldResumeAt: null };
  if (receipt?.nextAction !== "quota-hold-until-utc-reset" && receipt?.nextAction !== "resume-queued") {
    return { status: "unobserved", ...empty };
  }
  const day = receipt.heldUtcDay;
  const resume = receipt.heldResumeAt;
  if (typeof day !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(day)
    || typeof resume !== "string" || !/^\d{4}-\d{2}-\d{2}T00:00:00\.000Z$/.test(resume)) {
    return { status: "unverified", ...empty };
  }
  const dayStart = Date.parse(`${day}T00:00:00.000Z`);
  if (!Number.isFinite(dayStart) || new Date(dayStart).toISOString().slice(0, 10) !== day
    || new Date(dayStart + 86_400_000).toISOString() !== resume) {
    return { status: "unverified", ...empty };
  }
  return { status: "observed", heldUtcDay: day, heldResumeAt: resume };
}
