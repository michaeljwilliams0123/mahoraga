export type ChainHistoryEntry = { workerId:string; capability:string; errorFingerprint?:string };
export type ExecutionChainState = {
  taskId:string;
  chainId:string;
  handoffCount:number;
  receipts:Array<Record<string,unknown>>;
  history:ChainHistoryEntry[];
};

export function createExecutionChain(taskId:string, chainId:string): ExecutionChainState {
  return { taskId, chainId, handoffCount:0, receipts:[], history:[] };
}

export function selectionReceipt(lease: Record<string,unknown>, eligibleWorkerIds:string[]) {
  return { schemaVersion:1, kind:"route-selection-receipt", id:lease.selectionReceiptId,
    taskId:lease.taskId, chainId:lease.chainId, capability:lease.capability,
    selected:{workerId:lease.workerId,provider:lease.provider}, eligibleWorkers:eligibleWorkerIds };
}

export function handoffReceipt(handoff: Record<string,unknown>) {
  return { schemaVersion:1, kind:"handoff-receipt", taskId:handoff.taskId, chainId:handoff.chainId,
    fromWorkerId:handoff.fromWorkerId, requiredNextCapability:handoff.requiredNextCapability,
    hopCount:handoff.hopCount };
}

export function executionReceipt(lease:Record<string,unknown>, providerReceipt:Record<string,unknown>) {
  return { schemaVersion:1, kind:"execution-receipt", taskId:lease.taskId, chainId:lease.chainId,
    capability:lease.capability, workerId:lease.workerId, provider:lease.provider, providerReceipt };
}
