import test from "node:test";
import assert from "node:assert/strict";
import { validateGitLabAssurance } from "../src/gitlab-assurance.mjs";

const ledger = () => ({ repositoryIdentity: "michaeljwilliams0123/mahoraga", branch: "candidate", commitSha: "abc123", workflowVersion: "v1", commands: [{ id: "verify", conclusion: "success" }] });

test("accepts exact same-SHA GitHub and GitLab evidence", () => {
  assert.equal(validateGitLabAssurance({ objective: { id: "o1" }, github: ledger(), gitlab: ledger() }).ok, true);
});

test("blocks any identity, branch, sha, workflow, or conclusion mismatch", () => {
  for (const gitlab of [
    { ...ledger(), repositoryIdentity: "other/repo" },
    { ...ledger(), branch: "main" },
    { ...ledger(), commitSha: "def456" },
    { ...ledger(), workflowVersion: "v2" },
    { ...ledger(), commands: [{ id: "verify", conclusion: "failed" }] },
  ]) assert.equal(validateGitLabAssurance({ github: ledger(), gitlab }).reason, "dual-ledger-sha-mismatch");
});
