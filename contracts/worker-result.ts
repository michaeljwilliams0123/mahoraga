export type WorkerWaitingReason = string;
export type WorkerErrorCode = string;

export type CapabilityReceipt = Readonly<{
  id: string;
  outcome: "succeeded" | "failed" | "waiting";
}>;

export type WorkerResult<TOutput = unknown> =
  | Readonly<{ status: "completed"; receipt: CapabilityReceipt; output: TOutput }>
  | Readonly<{ status: "waiting"; reasonCode: WorkerWaitingReason }>
  | Readonly<{ status: "failed"; errorCode: WorkerErrorCode }>;

export type AssistantRespondOutput = Readonly<{
  answer: string;
}>;

export type AssistantRespondResult = WorkerResult<AssistantRespondOutput>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isReceipt(value: unknown): value is CapabilityReceipt {
  if (!isRecord(value)) return false;
  return typeof value.id === "string"
    && ["succeeded", "failed", "waiting"].includes(String(value.outcome));
}
export function isWorkerResult(value: unknown): value is WorkerResult {
  if (!isRecord(value) || typeof value.status !== "string") return false;

  if (value.status === "completed") {
    return isReceipt(value.receipt)
      && Object.prototype.hasOwnProperty.call(value, "output");
  }
  if (value.status === "waiting") {
    return typeof value.reasonCode === "string" && value.reasonCode.length > 0;
  }
  if (value.status === "failed") {
    return typeof value.errorCode === "string" && value.errorCode.length > 0;
  }
  return false;
}
