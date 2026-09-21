/** Present already-merged cognitive-learning-bridge receipts in the existing workspace UI. */

export type CognitiveLearningPromotionReceipt = {
  schemaVersion?: number;
  kind?: string;
  promotable?: boolean;
  reason?: string;
  sourceFingerprint?: string;
  verificationEvidenceRefs?: string[];
  record?: {
    provenance?: string;
    confidence?: number;
    evidenceRefs?: string[];
    statement?: string;
    memoryClass?: string;
    subject?: string;
  } | null;
};

export const LEARNING_REFUSAL_REASONS = {
  "verification-required": "Unverified outcome — promotion refused (fail-closed).",
  "cycle-not-promotable": "Hold / non-admitted cycle, unresolved dissent, or prediction/metacognition hold — promotion refused.",
  "cognitive-learning-verification-mismatch": "Verification mismatch — promotion refused (fail-closed).",
  "unresolved-dissent": "Unresolved dissent — promotion refused.",
  "prediction-hold": "Prediction hold — promotion refused.",
  "metacognition-hold": "Metacognition hold — promotion refused.",
} as const;

const HIDDEN_FIELDS = ["privateEpisodic", "privateEpisodicRefs", "prompt", "prompts", "transcript", "transcripts", "credential", "credentials", "ownerAuthority", "authorityGrant", "authorityGrants"];

export type PublicLearningSurface = {
  status: "promoted" | "refused" | "absent";
  headline: string;
  reasonLabel: string;
  provenance: string | null;
  confidence: number | null;
  evidenceRefs: string[];
  privacyNote: string;
};

const PRIVACY_NOTE =
  "Private episodic memory, prompts/transcripts, credentials, and authority grants are not shown or copied.";

function boundRefs(refs: unknown): string[] {
  if (!Array.isArray(refs)) return [];
  return refs
    .filter((item): item is string => typeof item === "string" && item.trim().length > 0 && item.length <= 240)
    .slice(0, 64);
}

export function projectCognitiveLearningSurface(receipt: CognitiveLearningPromotionReceipt | null | undefined): PublicLearningSurface {
  if (!receipt || receipt.kind !== "cognitive-learning-promotion") {
    return {
      status: "absent",
      headline: "No cognitive.learn promotion receipt on this cycle",
      reasonLabel: "awaiting verified-outcome receipt",
      provenance: null,
      confidence: null,
      evidenceRefs: [],
      privacyNote: PRIVACY_NOTE,
    };
  }
  if (receipt.promotable === true && receipt.record?.provenance === "verified-outcome") {
    const confidence = typeof receipt.record.confidence === "number" ? receipt.record.confidence : null;
    return {
      status: "promoted",
      headline: "Verified-outcome promoted to institutional learning",
      reasonLabel: receipt.reason === "verified-admitted-outcome" ? "verified admitted outcome" : (receipt.reason ?? "verified-admitted-outcome"),
      provenance: "verified-outcome",
      confidence,
      evidenceRefs: boundRefs(receipt.record.evidenceRefs),
      privacyNote: PRIVACY_NOTE,
    };
  }
  const code = receipt.reason ?? "cycle-not-promotable";
  const mapped = LEARNING_REFUSAL_REASONS[code as keyof typeof LEARNING_REFUSAL_REASONS];
  return {
    status: "refused",
    headline: "Institutional learning not promoted",
    reasonLabel: mapped ?? `${code} — promotion refused (fail-closed).`,
    provenance: null,
    confidence: null,
    evidenceRefs: boundRefs(receipt.verificationEvidenceRefs),
    privacyNote: PRIVACY_NOTE,
  };
}

export function assertNoPrivateLearningLeak(serialized: string): boolean {
  const lower = serialized.toLowerCase();
  return !HIDDEN_FIELDS.some((field) => lower.includes(field.toLowerCase()));
}
