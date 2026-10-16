/** One-off production proof requested by the owner for October 15 2026, 6 PM Eastern daylight time.
 * Driven by the existing five-minute Cron; no extra recurring trigger or inference.
 * Expires after two hours and cannot rerun after a receipt at/after the requested time.
 */
export const HUGGING_FACE_ONE_TIME_PROOF_UTC_MS = Date.parse("2026-10-15T22:00:00.000Z");
export const HUGGING_FACE_ONE_TIME_PROOF_EXPIRES_UTC_MS = HUGGING_FACE_ONE_TIME_PROOF_UTC_MS + 2 * 60 * 60_000;
export type HfPreviousObservation = { source_sha: string; observed_at: number; next_check_at: number };

export function shouldObserveHuggingFaceNow(
  now: number, targetSha: string, previous: HfPreviousObservation | undefined,
): boolean {
  if (!Number.isSafeInteger(now) || now < 0 || !/^[a-f0-9]{40}$/.test(targetSha)) return false;
  if (!previous || previous.source_sha !== targetSha) return true;
  const dueForOnce = now >= HUGGING_FACE_ONE_TIME_PROOF_UTC_MS
    && now < HUGGING_FACE_ONE_TIME_PROOF_EXPIRES_UTC_MS
    && Number.isSafeInteger(previous.observed_at)
    && previous.observed_at < HUGGING_FACE_ONE_TIME_PROOF_UTC_MS;
  return dueForOnce || (Number.isSafeInteger(previous.next_check_at) && now >= previous.next_check_at);
}
