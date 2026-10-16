import { createHash } from "node:crypto";

export const NATIVE_WATCH_INTERVAL_MS = 15 * 60_000;
export const NATIVE_WATCH_FAILURE_BACKOFF_MS = 60 * 60_000;
const SHA = /^[a-f0-9]{40}$/;

export type NativeObservation = {
  sourceSha: string;
  runtimeSha: string;
  verifyRunId: number | null;
  ubuntuPassed: boolean;
  windowsPassed: boolean;
  acceptanceRunId: number | null;
  acceptancePassed: boolean;
};

export type NativeEvidence = {
  schemaVersion: 1;
  kind: "native-source-production-evidence";
  sourceSha: string;
  runtimeSha: string;
  observedAt: number;
  fingerprint: string;
  phase: "accepted" | "held";
  reason: string | null;
  verifyRunId: number | null;
  acceptanceRunId: number | null;
  ubuntuPassed: boolean;
  windowsPassed: boolean;
  publication: "pending" | "published" | "already-present" | "held" | "not-authorized";
  publicationId: number | null;
  nextCheckAt: number;
};

export function judgeNativeObservation(value: NativeObservation): { phase: "accepted" | "held"; reason: string | null } {
  if (!SHA.test(value.sourceSha) || !SHA.test(value.runtimeSha)) return { phase: "held", reason: "native-source-invalid" };
  if (value.sourceSha !== value.runtimeSha) return { phase: "held", reason: "native-source-production-drift" };
  if (!Number.isSafeInteger(value.verifyRunId) || (value.verifyRunId ?? 0) < 1
    || value.ubuntuPassed !== true || value.windowsPassed !== true) return { phase: "held", reason: "native-exact-main-verify-unproven" };
  if (!Number.isSafeInteger(value.acceptanceRunId) || (value.acceptanceRunId ?? 0) < 1
    || value.acceptancePassed !== true) return { phase: "held", reason: "native-workspace-acceptance-unproven" };
  return { phase: "accepted", reason: null };
}
const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

export function isNativeEvidence(value: unknown): value is NativeEvidence {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const e = value as Partial<NativeEvidence>;
  const expected = ["schemaVersion","kind","sourceSha","runtimeSha","observedAt","fingerprint","phase","reason",
    "verifyRunId","acceptanceRunId","ubuntuPassed","windowsPassed","publication","publicationId","nextCheckAt"].sort();
  if (Object.keys(value).sort().join(",") !== expected.join(",")) return false;
  return e.schemaVersion === 1 && e.kind === "native-source-production-evidence"
    && typeof e.ubuntuPassed === "boolean" && typeof e.windowsPassed === "boolean"
    && (e.verifyRunId === null || (Number.isSafeInteger(e.verifyRunId) && (e.verifyRunId ?? 0) > 0))
    && (e.acceptanceRunId === null || (Number.isSafeInteger(e.acceptanceRunId) && (e.acceptanceRunId ?? 0) > 0))
    && typeof e.sourceSha === "string" && SHA.test(e.sourceSha)
    && typeof e.runtimeSha === "string" && SHA.test(e.runtimeSha)
    && typeof e.observedAt === "number" && Number.isSafeInteger(e.observedAt)
    && typeof e.nextCheckAt === "number" && Number.isSafeInteger(e.nextCheckAt)
    && typeof e.fingerprint === "string" && /^[a-f0-9]{64}$/.test(e.fingerprint)
    && (e.phase === "accepted" || e.phase === "held")
    && (e.reason === null || typeof e.reason === "string")
    && (e.publication === "pending" || e.publication === "published" || e.publication === "already-present" || e.publication === "held" || e.publication === "not-authorized")
    && (e.publicationId === null || (typeof e.publicationId === "number" && Number.isSafeInteger(e.publicationId) && e.publicationId > 0));
}

export interface NativeEvidenceStore {
  load(): NativeEvidence | null;
  save(value: NativeEvidence): void;
  archive(value: NativeEvidence): void;
}

// Only an exact accepted SHA may be published. Candidate plans remain non-mutating.
export class NativeContinuityWatch {
  private store: NativeEvidenceStore;
  private sourceSha: string;
  constructor(store: NativeEvidenceStore, sourceSha: string) {
    this.store = store; this.sourceSha = sourceSha;
    if (!SHA.test(sourceSha)) throw new TypeError("native-source-invalid");
  }
  async check(
    inspect: () => Promise<NativeObservation>,
    publish: (evidence: NativeEvidence) => Promise<{ alreadyPresent: boolean; id: number }>,
    now = Date.now(),
  ): Promise<NativeEvidence> {
    const previous = this.store.load();
    if (previous && isNativeEvidence(previous) && previous.sourceSha === this.sourceSha
      && now < previous.nextCheckAt) return previous;
    let value: NativeObservation;
    try {
      value = await inspect();
    } catch {
      return this.held(now, "native-inspection-unavailable");
    }
    if (value.sourceSha !== this.sourceSha) return this.held(now, "native-source-production-drift");
    const result = judgeNativeObservation(value);
    const fingerprint = digest({ sourceSha: value.sourceSha, runtimeSha: value.runtimeSha,
      verifyRunId: value.verifyRunId, acceptanceRunId: value.acceptanceRunId,
      ubuntuPassed: value.ubuntuPassed, windowsPassed: value.windowsPassed,
      acceptancePassed: value.acceptancePassed });
    const priorPublished = previous && previous.fingerprint === fingerprint
      && (previous.publication === "published" || previous.publication === "already-present");
    const evidence: NativeEvidence = {
      schemaVersion: 1, kind: "native-source-production-evidence",
      sourceSha: value.sourceSha, runtimeSha: value.runtimeSha, observedAt: now,
      fingerprint, phase: result.phase, reason: result.reason, verifyRunId: value.verifyRunId,
      acceptanceRunId: value.acceptanceRunId, ubuntuPassed: value.ubuntuPassed, windowsPassed: value.windowsPassed,
      publication: priorPublished ? previous.publication : result.phase === "accepted" ? "pending" : "not-authorized",
      publicationId: priorPublished ? previous.publicationId : null,
      nextCheckAt: now + NATIVE_WATCH_INTERVAL_MS,
    };
    this.store.save(evidence);
    if (result.phase !== "accepted" || priorPublished) {
      this.store.archive(evidence); return evidence;
    }
    try {
      const posted = await publish(evidence);
      if (!Number.isSafeInteger(posted.id) || posted.id < 1) throw new Error("native-publication-receipt-invalid");
      evidence.publication = posted.alreadyPresent ? "already-present" : "published";
      evidence.publicationId = posted.id;
    } catch (error) {
      evidence.publication = "held";
      const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
      evidence.reason = /^github-native-http-(401|403)$/.test(code) ? `native-publication-${code}` : "native-publication-unavailable";
      evidence.nextCheckAt = now + NATIVE_WATCH_FAILURE_BACKOFF_MS;
    }
    this.store.save(evidence);
    this.store.archive(evidence);
    return evidence;
  }
  private held(now: number, reason: string): NativeEvidence {
    const evidence: NativeEvidence = {
      schemaVersion: 1, kind: "native-source-production-evidence",
      sourceSha: this.sourceSha, runtimeSha: this.sourceSha,
      observedAt: now, fingerprint: digest({ sourceSha: this.sourceSha, reason }),
      phase: "held", reason, verifyRunId: null, acceptanceRunId: null,
      ubuntuPassed: false, windowsPassed: false, publication: "not-authorized",
      publicationId: null, nextCheckAt: now + NATIVE_WATCH_FAILURE_BACKOFF_MS,
    };
    this.store.save(evidence); this.store.archive(evidence); return evidence;
  }
}
