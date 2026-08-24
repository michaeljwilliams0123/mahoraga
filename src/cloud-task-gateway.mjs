import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createCodexCloudTask, validateCodexCloudTask } from "./codex-cloud-contract.mjs";
import { createAssignmentRecord, validateAssignmentRecord } from "./coordination-records.mjs";

const CANONICAL_REPOSITORY = "michaeljwilliams0123/mahoraga";
const NO_RESPONSE = new Set(["", "_No response_", "No response"]);
const TOOL_PROFILES = new Set([
  "Auto-route within repository", "Repository engineer", "UI and frontend",
  "Security review", "Testing and verification", "Documentation", "Release engineering",
]);
const LANES = new Set(["Codex cloud", "Desktop Codex", "Deterministic Actions"]);
const SECRET_PATTERN = /(?:\bsk-[A-Za-z0-9_-]{16,}|\bgithub_pat_[A-Za-z0-9_]{16,}|\bgh[pousr]_[A-Za-z0-9]{16,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|\bBearer\s+eyJ[A-Za-z0-9_-]{8,})/;
const ATTACHMENT_PATTERN = /https:\/\/(?:github\.com\/user-attachments\/assets|user-images\.githubusercontent\.com)\/[A-Za-z0-9._?&=/%-]+/g;

export async function dispatchCloudIssue({ event, baseCommit, root }) {
  const input = validateGatewayEvent(event, baseCommit);
  const fields = parseIssueForm(input.issue.body);
  const profile = requiredField(fields, "Tool profile");
  const preferredLane = requiredField(fields, "Preferred execution lane");
  if (!TOOL_PROFILES.has(profile)) throw new TypeError("cloud-gateway-tool-profile-invalid");
  if (!LANES.has(preferredLane)) throw new TypeError("cloud-gateway-execution-lane-invalid");
  if (input.command.mode === "codex" && preferredLane !== "Codex cloud") throw new TypeError("cloud-gateway-lane-command-mismatch");
  if (input.command.mode === "desktop" && preferredLane !== "Desktop Codex") throw new TypeError("cloud-gateway-lane-command-mismatch");

  const task = requiredField(fields, "Bounded task");
  const acceptance = requiredField(fields, "Acceptance criteria");
  const allowedPaths = lineList(requiredField(fields, "Allowed paths"));
  const verification = lineList(requiredField(fields, "Verification commands"));
  const suppliedBase = optionalField(fields, "Base commit");
  if (suppliedBase && suppliedBase.toLowerCase() !== input.baseCommit) throw new TypeError("cloud-gateway-base-commit-stale");
  const privacy = requiredField(fields, "Privacy confirmation");
  if (/\[ \]/.test(privacy) || (privacy.match(/\[[xX]\]/g) ?? []).length < 2) throw new TypeError("cloud-gateway-privacy-confirmation-required");

  const attachmentField = optionalField(fields, "Repository-safe attachments");
  const attachmentReferenceCount = [...attachmentField.matchAll(ATTACHMENT_PATTERN)].length;
  if (attachmentReferenceCount > 10) throw new TypeError("cloud-gateway-too-many-attachment-references");
  rejectSecrets([input.issue.title, input.issue.body, input.comment.body]);

  const title = boundedTitle(input.issue.title.replace(/^\[MAHORAGA\]\s*/i, ""));
  const source = `Source workspace issue: ${input.issue.html_url}. Repository-safe attachment references remain in that issue and are not copied into the coordination record.`;
  const expectedTask = `${task}\n\nAcceptance criteria:\n${acceptance}\n\nSkill profile: ${profile}.\n${source}`;
  const idempotency = optionalField(fields, "Idempotency key") || `github-issue-${input.issue.number}-${input.command.mode}-v1`;
  const output = input.command.mode === "codex"
    ? await writeCodexTask({ input, root, title, expectedTask, allowedPaths, verification, idempotency, fields })
    : await writeDesktopTask({ input, root, title, expectedTask, allowedPaths, idempotency });

  return Object.freeze({
    schemaVersion: 1,
    mode: input.command.mode,
    taskArea: input.command.taskArea,
    issueNumber: input.issue.number,
    sourceIssue: input.issue.html_url,
    attachmentReferenceCount,
    ...output,
  });
}

export function validateGatewayEvent(event, baseCommit) {
  if (!event || typeof event !== "object" || Array.isArray(event)) throw new TypeError("cloud-gateway-event-invalid");
  const repository = event.repository;
  const issue = event.issue;
  const comment = event.comment;
  if (repository?.full_name !== CANONICAL_REPOSITORY || repository?.owner?.login !== event.sender?.login) throw new TypeError("cloud-gateway-owner-required");
  if (comment?.user?.login !== repository.owner.login || comment?.author_association !== "OWNER") throw new TypeError("cloud-gateway-owner-required");
  if (!Number.isSafeInteger(issue?.number) || issue.number < 1 || issue.pull_request || typeof issue.body !== "string" || issue.body.length > 20000) throw new TypeError("cloud-gateway-issue-invalid");
  if (issue.user?.login === "github-actions[bot]") throw new TypeError("cloud-gateway-bot-issue-rejected");
  const expectedUrl = `https://github.com/${CANONICAL_REPOSITORY}/issues/${issue.number}`;
  if (issue.html_url !== expectedUrl || typeof issue.title !== "string" || !/^\[MAHORAGA\]\s+\S/.test(issue.title)) throw new TypeError("cloud-gateway-issue-invalid");
  if (typeof comment?.body !== "string" || comment.body.length > 120) throw new TypeError("cloud-gateway-command-invalid");
  const command = parseCommand(comment.body);
  const commit = String(baseCommit ?? "").toLowerCase();
  if (!/^[a-f0-9]{40}$/.test(commit)) throw new TypeError("cloud-gateway-base-commit-invalid");
  return Object.freeze({ repository, issue, comment, command, baseCommit: commit });
}

export function parseCommand(value) {
  const command = String(value ?? "").trim();
  if (command === "/mahoraga dispatch codex") return Object.freeze({ mode: "codex", taskArea: null });
  const desktop = command.match(/^\/mahoraga dispatch desktop ([a-z0-9][a-z0-9-]{0,63})$/);
  if (desktop) return Object.freeze({ mode: "desktop", taskArea: desktop[1] });
  throw new TypeError("cloud-gateway-command-invalid");
}

export function parseIssueForm(body) {
  if (typeof body !== "string" || body.length < 1 || body.length > 20000) throw new TypeError("cloud-gateway-issue-body-invalid");
  const fields = new Map();
  const normalized = `${body.replaceAll("\r\n", "\n").trimEnd()}\n\n### __END__\n\n`;
  for (const match of normalized.matchAll(/^### ([^\n]+)\n\n([\s\S]*?)(?=\n\n### )/gm)) {
    const label = match[1].trim();
    if (label === "__END__") continue;
    if (fields.has(label)) throw new TypeError("cloud-gateway-duplicate-field");
    fields.set(label, match[2].trim());
  }
  return fields;
}

async function writeCodexTask({ input, root, title, expectedTask, allowedPaths, verification, idempotency, fields }) {
  if (expectedTask.length > 2400) throw new TypeError("cloud-gateway-codex-task-too-large");
  const integration = requiredField(fields, "Integration mode");
  const integrationMode = integration === "Merge after verification" ? "merge-after-verify" : integration === "Pull request for review" ? "pull-request" : null;
  if (!integrationMode) throw new TypeError("cloud-gateway-integration-mode-invalid");
  const taskId = `ccx-${digest(`${CANONICAL_REPOSITORY}#${input.issue.number}:codex`)}`;
  const file = path.join(root, "coordination", "cloud-tasks", `${taskId}.json`);
  const existing = await optionalJson(file);
  const candidate = createCodexCloudTask({
    idempotencyKey: idempotency,
    repository: CANONICAL_REPOSITORY,
    baseCommit: existing?.baseCommit ?? input.baseCommit,
    title,
    task: expectedTask,
    allowedPaths,
    verification,
    maximumAttempts: 1,
    integrationMode,
    createdBy: "github-owner",
  }, { taskId, now: existing?.createdAt ?? input.issue.created_at });
  return persistIdempotently(file, existing ? validateCodexCloudTask(existing) : null, candidate, { recordId: taskId, idempotencyKey: candidate.idempotencyKey });
}

async function writeDesktopTask({ input, root, title, expectedTask, allowedPaths, idempotency }) {
  if (expectedTask.length > 1000) throw new TypeError("cloud-gateway-desktop-task-too-large");
  const assignmentId = `sec-${digest(`${CANONICAL_REPOSITORY}#${input.issue.number}:desktop:${input.command.taskArea}`)}`;
  const file = path.join(root, "coordination", "assignments", `${assignmentId}.json`);
  const existing = await optionalJson(file);
  const candidate = createAssignmentRecord({
    title,
    taskArea: input.command.taskArea,
    expectedTask,
    expectedBaseCommit: existing?.expectedBaseCommit ?? input.baseCommit,
    allowedPaths,
    correlationId: idempotency,
    createdBy: "main-codex",
    assignedTo: "secondary-codex",
  }, { assignmentId, now: existing?.createdAt ?? input.issue.created_at });
  return persistIdempotently(file, existing ? validateAssignmentRecord(existing) : null, candidate, { recordId: assignmentId, idempotencyKey: candidate.correlationId });
}

async function persistIdempotently(file, existing, candidate, identity) {
  if (existing) {
    if (JSON.stringify(existing) !== JSON.stringify(candidate)) throw new TypeError("cloud-gateway-idempotency-conflict");
    return Object.freeze({ changed: false, recordPath: portable(file), ...identity });
  }
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(candidate, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  return Object.freeze({ changed: true, recordPath: portable(file), ...identity });
}

async function optionalJson(file) {
  try { return JSON.parse(await readFile(file, "utf8")); }
  catch (error) { if (error?.code === "ENOENT") return null; throw error; }
}
function requiredField(fields, label) { const value = optionalField(fields, label); if (!value) throw new TypeError(`cloud-gateway-field-required:${label}`); return value; }
function optionalField(fields, label) { const value = fields.get(label)?.trim() ?? ""; return NO_RESPONSE.has(value) ? "" : value; }
function lineList(value) { const items = value.split(/\r?\n/).map((item) => item.trim().replace(/^[-*]\s+/, "").replace(/^`|`$/g, "")).filter(Boolean); if (items.length < 1 || new Set(items).size !== items.length) throw new TypeError("cloud-gateway-list-invalid"); return items; }
function boundedTitle(value) { const title = value.trim(); if (!title || title.length > 200 || /[\r\n\0]/.test(title)) throw new TypeError("cloud-gateway-title-invalid"); return title; }
function digest(value) { return createHash("sha256").update(value).digest("hex").slice(0, 32); }
function rejectSecrets(values) { if (values.some((value) => SECRET_PATTERN.test(value))) throw new TypeError("cloud-gateway-secret-pattern-rejected"); }
function portable(file) { return file.replaceAll("\\", "/"); }
