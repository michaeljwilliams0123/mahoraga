/** Validate an observed broker execution, never a self-declared worker-success flag. */
export type RuntimeCloudInspectionReceipt = {
  script: "mahoraga-owner-gateway";
  deploymentId: string;
  versionId: string;
  observedAt: string;
  trafficPercentage: 100;
};
type Data = Record<string, unknown>;
const record = (value: unknown): Data | null =>
  value !== null && typeof value === "object" && !Array.isArray(value) ? value as Data : null;
const id = (value: unknown): value is string => typeof value === "string" && /^[a-zA-Z0-9-]{12,100}$/.test(value);
const timestamp = (value: unknown): number =>
  typeof value === "string" ? Date.parse(value) : Number.NaN;

/** Validates exact task, chain, worker, receipt lineage, and fresh independent observation. */
export function validateCloudInspectionReceipt(
  input: unknown, taskId: string, chainId: string, nowMs: number = Date.now(),
): RuntimeCloudInspectionReceipt {
  const response = record(input);
  if (!response || response.status !== "complete" || response.taskId !== taskId
    || response.chainId !== chainId || response.handoffCount !== 0
    || !Array.isArray(response.receipts) || response.receipts.length !== 2) throw new Error("cloud-inspection-receipt-invalid");
  const receipts = response.receipts as unknown[];
  const selection = record(receipts.find(item => record(item)?.kind === "route-selection-receipt"));
  const execution = record(receipts.find(item => record(item)?.kind === "execution-receipt"));
  if (!selection || !execution || selection.schemaVersion !== 1 || execution.schemaVersion !== 1
    || selection.taskId !== taskId || execution.taskId !== taskId
    || selection.chainId !== chainId || execution.chainId !== chainId
    || selection.capability !== "cloud.inspect" || execution.capability !== "cloud.inspect"
    || !/^sel-[a-f0-9]{16}$/.test(String(selection.id))
    || !/^lease-[a-f0-9]{16}$/.test(String(selection.routeLeaseId))
    || !Array.isArray(selection.eligibleWorkers)
    || !selection.eligibleWorkers.includes("cloudflare-readonly-inspector")) throw new Error("cloud-inspection-receipt-invalid");
  const selected = record(selection.selected);
  if (!selected || selected.workerId !== "cloudflare-readonly-inspector" || selected.provider !== "cloudflare"
    || execution.workerId !== selected.workerId || execution.provider !== selected.provider
    || execution.selectionReceiptId !== selection.id || execution.routeLeaseId !== selection.routeLeaseId) throw new Error("cloud-inspection-receipt-invalid");
  const provider = record(execution.providerReceipt);
  if (!provider || provider.verified !== true || provider.readOnly !== true
    || provider.capability !== "cloud.inspect" || provider.provider !== "cloudflare"
    || provider.workerId !== "cloudflare-readonly-inspector" || provider.taskId !== taskId
    || provider.chainId !== chainId || provider.selectionReceiptId !== selection.id
    || provider.routeLeaseId !== selection.routeLeaseId
    || !/^lease-[a-f0-9]{16}$/.test(String(provider.routeLeaseId))
    || provider.id !== `cloud-inspect-${provider.routeLeaseId}`
    || provider.script !== "mahoraga-owner-gateway" || provider.trafficPercentage !== 100
    || !id(provider.deploymentId) || !id(provider.versionId)
    || !Number.isFinite(timestamp(provider.deployedAt))) throw new Error("cloud-inspection-receipt-invalid");
  const observedAt = timestamp(provider.observedAt);
  if (!Number.isFinite(nowMs) || !Number.isFinite(observedAt)
    || observedAt < nowMs - 90_000 || observedAt > nowMs + 5_000) throw new Error("cloud-inspection-receipt-invalid");
  return {
    script: "mahoraga-owner-gateway",
    deploymentId: provider.deploymentId as string,
    versionId: provider.versionId as string,
    observedAt: provider.observedAt as string,
    trafficPercentage: 100,
  };
}

/** A UI hint, not an authority grant: the broker must revalidate on execution. */
export function isFreshCloudInspectorCapability(
  item: { capability: string; routable: boolean; enabled?: boolean; provider?: string;
    workerId?: string | null; workerIds: string[]; lastObservedAt?: string | null },
  nowMs: number = Date.now(),
): boolean {
  const observed = typeof item.lastObservedAt === "string" ? Date.parse(item.lastObservedAt) : Number.NaN;
  return item.capability === "cloud.inspect" && item.routable && item.enabled !== false
    && item.provider === "cloudflare" && item.workerId === "cloudflare-readonly-inspector"
    && Array.isArray(item.workerIds) && item.workerIds.includes("cloudflare-readonly-inspector")
    && Number.isFinite(nowMs) && Number.isFinite(observed)
    && observed >= nowMs - 30_000 && observed <= nowMs + 5_000;
}
