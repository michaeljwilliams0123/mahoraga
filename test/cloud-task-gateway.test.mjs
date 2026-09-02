import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { dispatchCloudIssue, parseCommand, parseIssueForm } from "../src/cloud-task-gateway.mjs";
import { validateCodexCloudTask } from "../src/codex-cloud-contract.mjs";
import { validateAssignmentRecord } from "../src/coordination-records.mjs";

const BASE = "a".repeat(40);

test("owner-approved cloud issue creates one deterministic Codex task", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "mhg-gateway-"));
  const event = fixture();
  const first = await dispatchCloudIssue({ event, baseCommit: BASE, root });
  const retry = await dispatchCloudIssue({ event, baseCommit: "b".repeat(40), root });
  assert.equal(first.mode, "codex");
  assert.equal(first.changed, true);
  assert.equal(retry.changed, false);
  assert.equal(retry.recordId, first.recordId);
  assert.equal(first.attachmentReferenceCount, 1);
  const record = validateCodexCloudTask(JSON.parse(await readFile(first.recordPath, "utf8")));
  assert.equal(record.idempotencyKey, "github-issue-42-codex-v1");
  assert.match(record.task, /Source workspace issue: https:\/\/github\.com\/michaeljwilliams0123\/mahoraga\/issues\/42/);
  assert.doesNotMatch(JSON.stringify(record), /user-attachments/);
});

test("owner can route the same bounded form to a registered desktop task area", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "mhg-gateway-"));
  const event = fixture({ command: "/mahoraga dispatch desktop mahoraga", lane: "Desktop Codex", task: "Update the cloud workspace." });
  const result = await dispatchCloudIssue({ event, baseCommit: BASE, root });
  const record = validateAssignmentRecord(JSON.parse(await readFile(result.recordPath, "utf8")));
  assert.equal(result.mode, "desktop");
  assert.equal(record.taskArea, "mahoraga");
  assert.equal(record.correlationId, "github-issue-42-desktop-v1");
  assert.equal(record.expectedBaseCommit, BASE);
});

test("owner can route a blocked Primary task to Secondary from the same bounded issue", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "mhg-gateway-"));
  await dispatchCloudIssue({ event: fixture(), baseCommit: BASE, root });
  const fallback = fixture({ command: "/mahoraga dispatch fallback mahoraga", lane: "Codex cloud" });
  const result = await dispatchCloudIssue({ event: fallback, baseCommit: BASE, root });
  const record = validateAssignmentRecord(JSON.parse(await readFile(result.recordPath, "utf8")));
  assert.equal(result.mode, "fallback");
  assert.equal(record.taskArea, "mahoraga");
  assert.equal(record.correlationId, "github-issue-42-fallback-v1");
  assert.equal(record.assignedTo, "secondary-codex");
});

test("Secondary fallback cannot be staged before its exact Primary task", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "mhg-gateway-"));
  const event = fixture({ command: "/mahoraga dispatch fallback mahoraga", lane: "Codex cloud" });
  await assert.rejects(dispatchCloudIssue({ event, baseCommit: BASE, root }), /primary-required-before-fallback/);
});

test("gateway rejects non-owner commands, lane changes, secrets, and unchecked privacy", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "mhg-gateway-"));
  const nonOwner = fixture(); nonOwner.sender.login = "stranger"; nonOwner.comment.user.login = "stranger"; nonOwner.comment.author_association = "NONE";
  await assert.rejects(dispatchCloudIssue({ event: nonOwner, baseCommit: BASE, root }), /owner-required/);
  await assert.rejects(dispatchCloudIssue({ event: fixture({ lane: "Desktop Codex" }), baseCommit: BASE, root }), /lane-command-mismatch/);
  await assert.rejects(dispatchCloudIssue({ event: fixture({ task: `Use github_pat_${"x".repeat(40)}` }), baseCommit: BASE, root }), /secret-pattern-rejected/);
  await assert.rejects(dispatchCloudIssue({ event: fixture({ privacy: "- [ ] Confirmed\n- [x] Explicit" }), baseCommit: BASE, root }), /privacy-confirmation-required/);
});

test("gateway parser accepts only exact bounded dispatch commands and unique form fields", () => {
  assert.deepEqual(parseCommand("/mahoraga dispatch codex"), { mode: "codex", taskArea: null });
  assert.deepEqual(parseCommand("/mahoraga dispatch desktop main-pc"), { mode: "desktop", taskArea: "main-pc" });
  assert.deepEqual(parseCommand("/mahoraga dispatch fallback main-pc"), { mode: "fallback", taskArea: "main-pc" });
  assert.throws(() => parseCommand("/mahoraga run anything"), /command-invalid/);
  assert.equal(parseIssueForm("### A\n\none\n\n### B\n\ntwo").get("B"), "two");
  assert.throws(() => parseIssueForm("### A\n\none\n\n### A\n\ntwo"), /duplicate-field/);
});

function fixture({ command = "/mahoraga dispatch codex", lane = "Codex cloud", task = "Implement the bounded repository update.", privacy = "- [x] Repository safe\n- [x] Explicit model approval" } = {}) {
  return {
    repository: { full_name: "michaeljwilliams0123/mahoraga", owner: { login: "michaeljwilliams0123" } },
    sender: { login: "michaeljwilliams0123" },
    issue: {
      number: 42,
      title: "[MAHORAGA] Cloud gateway test",
      body: formBody({ lane, task, privacy }),
      html_url: "https://github.com/michaeljwilliams0123/mahoraga/issues/42",
      created_at: "2026-08-24T12:00:00.000Z",
      user: { login: "contributor" },
    },
    comment: { body: command, user: { login: "michaeljwilliams0123" }, author_association: "OWNER" },
  };
}

function formBody({ lane, task, privacy }) {
  return [
    "### Idempotency key", "", "_No response_", "", "### Base commit", "", "_No response_", "",
    "### Bounded task", "", task, "", "### Tool profile", "", "UI and frontend", "",
    "### Preferred execution lane", "", lane, "", "### Integration mode", "", "Pull request for review", "",
    "### Allowed paths", "", "cloud\ntest", "", "### Verification commands", "", "npm run verify", "",
    "### Acceptance criteria", "", "All tests pass.", "", "### Repository-safe attachments", "",
    "https://github.com/user-attachments/assets/12345678-abcd", "", "### Privacy confirmation", "", privacy,
  ].join("\n");
}
