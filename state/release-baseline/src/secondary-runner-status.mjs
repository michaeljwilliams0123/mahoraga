import { readFileSync } from "node:fs";
import path from "node:path";
import { ROOT } from "./config.mjs";

export function secondaryRunnerSnapshot(root = ROOT) {
  const config = readJson(path.join(root, "state", "secondary-runner.json"));
  const state = readJson(path.join(root, "state", "secondary-runner-state.json"));
  const assignmentStates = Object.values(state.value?.assignments ?? {}).map((record) => safeState(record?.state));
  return {
    configured: config.exists && !config.invalid,
    stateReadable: state.exists && !state.invalid,
    enabledTaskAreas: safeTaskAreas(config.value?.projects),
    lastRunAt: safeTimestamp(state.value?.lastRunAt),
    lastOutcome: safeOutcome(state.value?.lastOutcome),
    assignmentCounts: Object.fromEntries(["completed", "failed", "retryable", "returned"].map((name) => [name, assignmentStates.filter((stateName) => stateName === name).length])),
    error: config.invalid ? "runner-config-invalid" : state.invalid ? "runner-state-invalid" : null,
  };
}

function readJson(file) {
  try { return { exists: true, invalid: false, value: JSON.parse(readFileSync(file, "utf8")) }; }
  catch (error) { return error?.code === "ENOENT" ? { exists: false, invalid: false, value: null } : { exists: true, invalid: true, value: null }; }
}

function safeTaskAreas(projects) {
  if (!Array.isArray(projects)) return [];
  return [...new Set(projects.filter((project) => project?.enabled === true && typeof project.taskArea === "string" && /^[a-z0-9][a-z0-9-]{0,63}$/.test(project.taskArea)).map((project) => project.taskArea))].sort();
}

function safeState(value) {
  return new Set(["completed", "failed", "retryable", "returned"]).has(value) ? value : "unknown";
}

function safeTimestamp(value) {
  return typeof value === "string" && Number.isFinite(Date.parse(value)) ? value : null;
}

function safeOutcome(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const result = {};
  if (typeof value.status === "string" && /^[a-z][a-z-]{0,39}$/.test(value.status)) result.status = value.status;
  if (typeof value.assignmentId === "string" && /^sec-[a-f0-9-]{8,72}$/i.test(value.assignmentId)) result.assignmentId = value.assignmentId;
  if (Number.isInteger(value.attempt) && value.attempt >= 1 && value.attempt <= 5) result.attempt = value.attempt;
  if (typeof value.reason === "string" && /^[a-z0-9._-]{1,80}$/.test(value.reason)) result.reason = value.reason;
  if (typeof value.returnBranch === "string" && /^secondary\/sec-[a-f0-9-]{8,72}$/i.test(value.returnBranch)) result.returnBranch = value.returnBranch;
  if (typeof value.returnCommit === "string" && /^[a-f0-9]{7,64}$/i.test(value.returnCommit)) result.returnCommit = value.returnCommit.toLowerCase();
  return Object.keys(result).length ? result : null;
}
