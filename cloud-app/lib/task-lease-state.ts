export type TaskLeaseSurface = {
  status: string;
  errorCode?: string | null;
};

export const LEASE_EXPIRED = "lease-expired";

export function isLeaseExpired(task: TaskLeaseSurface | null | undefined) {
  return (task?.errorCode ?? "") === LEASE_EXPIRED;
}

export function isLeaseExpiredTerminal(task: TaskLeaseSurface | null | undefined) {
  return task?.status === "failed" && isLeaseExpired(task);
}

export function isLeaseExpiredQueuedRetry(task: TaskLeaseSurface | null | undefined) {
  return task?.status === "queued" && isLeaseExpired(task);
}

export function isClaimableTask(task: TaskLeaseSurface | null | undefined) {
  if (!task) return false;
  if (isLeaseExpiredTerminal(task)) return false;
  return task.status === "queued";
}

export function leaseExpiredLabel(task: TaskLeaseSurface | null | undefined) {
  if (isLeaseExpiredTerminal(task)) return "Failed · lease-expired · not claimable";
  if (isLeaseExpiredQueuedRetry(task)) return "Queued · lease-expired · retry remaining";
  return null;
}
