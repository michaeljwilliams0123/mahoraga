export const TRANSFORM_KINDS = [
  "translation",
  "transcription",
  "ocr",
  "summarization",
  "resize",
  "format-conversion",
] as const;

export type TransformKind = (typeof TRANSFORM_KINDS)[number];

export type TransformationProvenanceSurface = {
  product: "Mahoraga";
  buildProvenanceOnly: "7.0.0-alpha.2";
  kinds: readonly TransformKind[];
  sourceDistinctFromDerivative: true;
  sourceEvidenceReferenceResolvesTo: "sourceReference";
  sourceEvidenceReferenceNever: "outputReference";
  binding: "workerReceiptReference+transformVersion";
  confidenceObservationalOnly: true;
  failClosed: true;
  grantsTrafficAuthority: false;
  createsProviderRoute: false;
  addsProviderCredentials: false;
};

export function projectTransformationProvenanceSurface(): TransformationProvenanceSurface {
  return {
    product: "Mahoraga",
    buildProvenanceOnly: "7.0.0-alpha.2",
    kinds: TRANSFORM_KINDS,
    sourceDistinctFromDerivative: true,
    sourceEvidenceReferenceResolvesTo: "sourceReference",
    sourceEvidenceReferenceNever: "outputReference",
    binding: "workerReceiptReference+transformVersion",
    confidenceObservationalOnly: true,
    failClosed: true,
    grantsTrafficAuthority: false,
    createsProviderRoute: false,
    addsProviderCredentials: false,
  };
}

export function sourceEvidenceReferenceDisplay(receipt: {
  sourceReference?: string;
  outputReference?: string;
}): string | null {
  if (!receipt || typeof receipt.sourceReference !== "string" || receipt.sourceReference.length === 0) {
    return null;
  }
  if (receipt.sourceReference === receipt.outputReference) return null;
  return receipt.sourceReference;
}
