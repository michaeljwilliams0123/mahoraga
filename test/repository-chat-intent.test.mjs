import test from "node:test";
import assert from "node:assert/strict";
import { isReadOnlyRepositoryEvidenceRequest } from "../src/repository-chat-intent.mjs";

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
