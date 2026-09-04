const FOUR_HOURS_MS = 4 * 60 * 60 * 1000;
const TEN_MINUTES_MS = 10 * 60 * 1000;

export const SOVEREIGN_CADENCE_VERSION = "v2";
export const SOVEREIGN_INTERVAL_MS = FOUR_HOURS_MS;
export const SOVEREIGN_DEPLOYMENT_DELAY_MS = TEN_MINUTES_MS;

export function createDeploymentAnchor(releasedAt, delayMs = SOVEREIGN_DEPLOYMENT_DELAY_MS) {
  const releasedMs = exactTime(releasedAt, "release completion");
  if (!Number.isSafeInteger(delayMs) || delayMs < 0) throw new TypeError("deployment delay is invalid");
  return new Date(releasedMs + delayMs).toISOString();
}

export function getAnchoredFourHourWindowStart(now, anchorAtUtc) {
  const nowMs = exactTime(now, "current time");
  const anchorMs = exactTime(anchorAtUtc, "cadence anchor");
  if (nowMs < anchorMs) return null;
  const elapsed = nowMs - anchorMs;
  const windowIndex = Math.floor(elapsed / SOVEREIGN_INTERVAL_MS);
  return new Date(anchorMs + (windowIndex * SOVEREIGN_INTERVAL_MS)).toISOString();
}

export function getCycleWindowEpoch(windowStartUtc) {
  return Math.floor(exactTime(windowStartUtc, "cycle window") / 1000);
}

export function getAnchorEpoch(anchorAtUtc) {
  return Math.floor(exactTime(anchorAtUtc, "cadence anchor") / 1000);
}

export function fromEpochSeconds(epochSeconds) {
  const value = Number(epochSeconds);
  if (!Number.isSafeInteger(value) || value < 1) throw new TypeError("epoch seconds are invalid");
  return new Date(value * 1000).toISOString();
}

function exactTime(value, label) {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  const time = date.getTime();
  if (!Number.isFinite(time)) throw new TypeError(`${label} is invalid`);
  return time;
}
