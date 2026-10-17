import { describe, expect, it } from "vitest";
import { projectGitHubActionReceipt, readGitHubActionReceipt } from "../deploy/cloudflare-execution-runtime/github-action-receipt";

const shaA = "a".repeat(40);
const shaB = "b".repeat(40);
const repo = { provider: "github-app", repository: "michaeljwilliams0123/mahoraga" };

describe("bounded GitHub App receipts", () => {
  it("captures exact readback identifiers for PR creation and squash merge", () => {
    const created = projectGitHubActionReceipt("create", {
      ...repo, number: 1148, draft: true, state: "open", head: { sha: shaB }, base: { sha: shaA },
      title: "private title", body: "private prompt", token: "never-share",
    });
    expect(created).toEqual({ action: "create", kind: "pull-request", number: 1148, headSha: shaB, outcome: "accepted" });
    expect(JSON.stringify(created)).not.toMatch(/title|private|token|never-share/);
    const merged = projectGitHubActionReceipt("merge", {
      ...repo, number: 1148, merged: true, mergeMethod: "squash", head: { sha: shaB }, main: { sha: shaA },
    });
    expect(merged).toEqual({ action: "merge", kind: "pull-request", number: 1148,
      headSha: shaB, mainSha: shaA, outcome: "success" });
  });

  it("does not report a workflow run when dispatch only acknowledged the request", () => {
    expect(projectGitHubActionReceipt("dispatch", { ...repo, accepted: true, headSha: shaA, run: null }))
      .toEqual({ action: "dispatch", kind: "workflow", headSha: shaA, outcome: "accepted" });
    expect(projectGitHubActionReceipt("dispatch", { ...repo, accepted: true, headSha: shaA, run: { id: 1909 } }))
      .toEqual({ action: "dispatch", kind: "workflow", headSha: shaA, runId: 1909, outcome: "accepted" });
  });

  it("captures checks as pending, failure, or success without promotion claims", () => {
    expect(projectGitHubActionReceipt("checks", {
      ...repo, number: 1148, head: { sha: shaB }, state: "pending", run: { id: 2020 },
    })).toEqual({ action: "checks", kind: "pull-request", number: 1148,
      headSha: shaB, runId: 2020, outcome: "pending" });
    expect(projectGitHubActionReceipt("status", { ...repo, headSha: shaA })).toEqual({
      action: "status", kind: "repository", mainSha: shaA, outcome: "observed",
    });
  });

  it("drops wrong-repository and malformed or unverified return objects", () => {
    const good = { ...repo, number: 1148, draft: true, state: "open", head: { sha: shaB } };
    expect(projectGitHubActionReceipt("create", { ...good, provider: "unverified" })).toBeNull();
    expect(projectGitHubActionReceipt("create", { ...good, repository: "someone/other" })).toBeNull();
    expect(projectGitHubActionReceipt("create", { ...good, head: { sha: "main" } })).toBeNull();
    expect(projectGitHubActionReceipt("create", { ...good, state: "closed" })).toBeNull();
    expect(projectGitHubActionReceipt("merge", { ...good, merged: false, main: { sha: shaA } })).toBeNull();
    expect(projectGitHubActionReceipt("status", { ...repo, headSha: "not-sha" })).toBeNull();
    expect(projectGitHubActionReceipt("unauthorized", good)).toBeNull();
  });

  it("limits mutation receipts to native IDs without echoing user content", () => {
    const value = projectGitHubActionReceipt("issue-create", {
      ...repo, action: "issue-create", kind: "issue", number: 111, title: "top secret", body: "do not leak",
    });
    expect(value).toEqual({ action: "issue-create", kind: "issue", number: 111, outcome: "accepted" });
    expect(projectGitHubActionReceipt("comment-delete", {
      ...repo, action: "comment-delete", kind: "comment", number: 111, commentId: 7654,
    })).toBeNull();
  });

  it("reads stored JSON through allowlisted fields and rejects malformed legacy rows", () => {
    const receipt = projectGitHubActionReceipt("create", {
      ...repo, number: 1148, draft: true, state: "open", head: { sha: shaB },
    })!;
    expect(readGitHubActionReceipt(JSON.stringify(receipt))).toEqual(receipt);
    expect(readGitHubActionReceipt(null)).toBeNull();
    expect(readGitHubActionReceipt("{bad")).toBeNull();
    expect(readGitHubActionReceipt(JSON.stringify({ ...receipt, headSha: "malformed" }))).toBeNull();
    expect(readGitHubActionReceipt("x".repeat(1601))).toBeNull();
    expect(JSON.stringify(readGitHubActionReceipt(JSON.stringify({ ...receipt, secret: "private" }))))
      .not.toContain("private");
  });
});
