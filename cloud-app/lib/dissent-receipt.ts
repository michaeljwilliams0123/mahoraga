export type DissentObservationAction = "escalate" | "reobserve" | "none";

export type CollectiveDissentItem = {
  individualId: string;
  dissentTags: string[];
  evidenceRefs: string[];
  blocking: boolean;
  escalation: boolean;
  unresolvedCycles: number;
  reasonCode: string;
  confidenceBefore?: number | null;
  confidenceAfter?: number | null;
  observation?: { priorStatus?: string; nextAction?: DissentObservationAction };
};

export type AlternativeSupport = {
  conclusion: string | null;
  currentIndependentLineageCount: number;
  currentParticipantCount: number;
  lineageRoots: string[];
  qualified: boolean;
};

export type CollectiveDissentReceipt = {
  schemaVersion: number;
  kind: "collective-dissent-resolution";
  blockingCount: number;
  preservedNonBlockingCount: number;
  escalationCount: number;
  alternativeSupport: AlternativeSupport;
  items: CollectiveDissentItem[];
  fingerprint?: string;
  rawCollectiveDissent?: unknown;
};

export function isCollectiveDissentReceipt(value: unknown): value is CollectiveDissentReceipt {
  if (!value || typeof value !== "object") return false;
  const receipt = value as Partial<CollectiveDissentReceipt>;
  return receipt.kind === "collective-dissent-resolution" && Array.isArray(receipt.items);
}

export function summarizeDissentGate(receipt: CollectiveDissentReceipt | null | undefined) {
  if (!receipt) {
    return {
      label: "No dissent receipt",
      tone: "neutral" as const,
      detail: "Resolver output not present on this turn",
    };
  }
  if (receipt.escalationCount > 0) {
    return {
      label: "dissent-escalation",
      tone: "warn" as const,
      detail: `${receipt.escalationCount} claim(s) blocking after 3 unresolved cycles`,
    };
  }
  if (receipt.blockingCount > 0) {
    const failClosed = receipt.items.some((item) => item.observation?.nextAction === "reobserve" || item.reasonCode.includes("reobservation") || item.reasonCode === "evidence-unverified");
    return {
      label: failClosed ? "fail-closed re-observation" : "blocking dissent",
      tone: "warn" as const,
      detail: `${receipt.blockingCount} blocking · ${receipt.preservedNonBlockingCount} nonblocking`,
    };
  }
  return {
    label: "nonblocking dissent",
    tone: "good" as const,
    detail: `${receipt.preservedNonBlockingCount} preserved · alternative ${receipt.alternativeSupport.qualified ? "qualified" : "unqualified"}`,
  };
}
