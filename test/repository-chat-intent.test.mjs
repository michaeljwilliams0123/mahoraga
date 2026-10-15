import test from "node:test";
import assert from "node:assert/strict";
import { isReadOnlyRepositoryEvidenceRequest, parseRepositoryAdminCommand } from "../src/repository-chat-intent.mjs";

test("read-only repository evidence requests use the native GitHub App", () => {
  assert.equal(isReadOnlyRepositoryEvidenceRequest("/repo inspect"), true);
  assert.equal(isReadOnlyRepositoryEvidenceRequest("Using the GitHub repository inspection you just completed, summarize the verified repository, branch, and commit SHA. Identify the next highest-impact execution capability to implement. Distinguish verified evidence from capabilities you cannot yet execute. Do not invent GitHub results."), true);
  assert.equal(isReadOnlyRepositoryEvidenceRequest("Summarize verified GitHub branch and commit SHA"), true);
  assert.equal(isReadOnlyRepositoryEvidenceRequest("What's the authoritative GitHub main SHA?"), true);
});
test("read-only routing never impersonates source editing or general tool calls", () => {
  assert.equal(isReadOnlyRepositoryEvidenceRequest("Review the connected repository, choose an improvement, implement it and open a PR"), false);
  assert.equal(isReadOnlyRepositoryEvidenceRequest("Merge the GitHub repository PR"), false);
  assert.equal(isReadOnlyRepositoryEvidenceRequest("Please modify repository source code and push changes"), false);
  assert.equal(isReadOnlyRepositoryEvidenceRequest("How can we build a repository capability injector?"), false);
  assert.equal(isReadOnlyRepositoryEvidenceRequest("Explain the difference between repository.inspect and repository.write"), false);
  assert.equal(isReadOnlyRepositoryEvidenceRequest(""), false);
});

test("repository administration commands are explicit and typed", () => {
  assert.deepEqual(parseRepositoryAdminCommand("/repo admin status"), { action: "status", proposal: null });
  assert.deepEqual(parseRepositoryAdminCommand('/repo pr create {"expectedMainSha":"' + "a".repeat(40) + '","branch":"mahoraga/native-chat","title":"Native chat","body":"Bounded change.","commitMessage":"Native chat","files":[{"path":"docs/native-chat.md","content":"verified\\n"}]}'), {
    action: "create",
    proposal: {
      expectedMainSha: "a".repeat(40), branch: "mahoraga/native-chat", title: "Native chat", body: "Bounded change.",
      commitMessage: "Native chat", files: [{ path: "docs/native-chat.md", content: "verified\n" }],
    },
  });
  assert.deepEqual(parseRepositoryAdminCommand('/repo pr merge {"number":1103,"expectedMainSha":"' + "a".repeat(40) + '","expectedHeadSha":"' + "b".repeat(40) + '","commitTitle":"Merge native chat"}'), {
    action: "merge",
    proposal: { number: 1103, expectedMainSha: "a".repeat(40), expectedHeadSha: "b".repeat(40), commitTitle: "Merge native chat" },
  });
});

test("repository administration parser rejects ambiguous or malformed writes", () => {
  for (const message of [
    "/repo pr create", "/repo pr merge", "/repo pr create []", "/repo pr merge nope", "/repo admin status now",
    "Please create a PR", "/repo main write {}", "/repo pr create {\"files\":[] } trailing",
  ]) assert.throws(() => parseRepositoryAdminCommand(message), /repository-admin-command-invalid/);
});
