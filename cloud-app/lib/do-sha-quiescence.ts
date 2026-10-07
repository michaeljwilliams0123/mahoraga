export const DO_SHA_MISMATCH_IDLE_MS = 15_000;
export const DO_TRANSIENT_RETRY_MS = 5_000;
export const DO_QUIESCENCE_MERGE = "#1028";

export type DoShaQuiescence = {
  statusLabel: string;
  detail: string;
  tone: "good" | "warn" | "neutral";
  idleMs: number | null;
};

export function projectDoShaQuiescence(reasonCode: string | null | undefined): DoShaQuiescence {
  const hypothesis = `Merge ${DO_QUIESCENCE_MERGE} is a bounded hypothesis, not proof the Durable Object version skew is repaired`;
  const hold = "production stays held until exact-main runtime acceptance · observational only · not traffic authority · Windows remains 3.6.0";
  if (reasonCode === "live-sha-mismatch" || reasonCode === "ready-sha-mismatch") {
    return {
      statusLabel: "SHA mismatch / idle window",
      detail: `${reasonCode} · next probe backs off ${DO_SHA_MISMATCH_IDLE_MS / 1000}s so a hibernateable Durable Object can quiesce · ${hypothesis} · ${hold}`,
      tone: "warn",
      idleMs: DO_SHA_MISMATCH_IDLE_MS,
    };
  }
  if (reasonCode === "transient" || reasonCode === "http-503") {
    return {
      statusLabel: "Transient retry",
      detail: `ordinary HTTP/transport failure keeps ${DO_TRANSIENT_RETRY_MS / 1000}s retries · ${hypothesis} · ${hold}`,
      tone: "neutral",
      idleMs: DO_TRANSIENT_RETRY_MS,
    };
  }
  if (reasonCode === "converged") {
    return {
      statusLabel: "SHA aligned / observed",
      detail: `live and ready SHA matched on this readback only · ${hypothesis} · ${hold}`,
      tone: "good",
      idleMs: null,
    };
  }
  return {
    statusLabel: "Unobserved / fail-closed",
    detail: `no live/ready SHA diagnosis · do not invent convergence · ${hypothesis} · ${hold}`,
    tone: "neutral",
    idleMs: null,
  };
}
