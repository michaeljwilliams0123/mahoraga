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

  it("rejects stored receipts that cannot describe a native action result", () => {
    for (const receipt of [
      { action: "unknown", kind: "repository", outcome: "observed" },
      { action: "merge", kind: "pull-request", number: 12, outcome: "success" },
      { action: "create", kind: "issue", number: 12, headSha: shaB, outcome: "accepted" },
      { action: "dispatch", kind: "workflow", headSha: shaB, outcome: "success" },
      { action: "status", kind: "repository", mainSha: shaA, outcome: "success" },
      { action: "checks", kind: "pull-request", headSha: shaB, outcome: "success" },
      { action: "comment-create", kind: "comment", number: 12, outcome: "accepted" },
      { action: "pr-update", kind: "issue", number: 12, outcome: "accepted" },
    ]) expect(readGitHubActionReceipt(JSON.stringify(receipt))).toBeNull();
  });

  it("rejects misclassified mutations and comments without a result ID at creation", () => {
    for (const action of ["issue-create", "issue-update", "pr-update", "comment-create", "comment-delete"]) {
      expect(projectGitHubActionReceipt(action, {
        ...repo, action, kind: action === "pr-update" ? "issue" : "pull-request", number: 12,
      })).toBeNull();
    }
  });

  it("preserves every supported action across persisted receipt reads", () => {
    const transactions: Array<[string, Record<string, unknown>]> = [
      ["status", { headSha: shaA }],
      ["create", { number: 12, draft: true, state: "open", head: { sha: shaB } }],
      ["merge", { number: 12, merged: true, mergeMethod: "squash", head: { sha: shaB }, main: { sha: shaA } }],
      ["dispatch", { accepted: true, headSha: shaB }],
      ...["checks", "diagnose"].flatMap(action => ["pending", "success", "failure"].map(state =>
        [action, { number: 12, head: { sha: shaB }, state, run: { id: 19 } }] as [string, Record<string, unknown>])),
      ...["issue-create", "issue-update", "pr-update"].map(action =>
        [action, { action, kind: action === "pr-update" ? "pull-request" : "issue", number: 12 }] as [string, Record<string, unknown>]),
      ...["comment-create", "comment-delete"].flatMap(action => ["issue", "pull-request"].map(kind =>
        [action, { action, kind, number: 12, commentId: 91 }] as [string, Record<string, unknown>])),
    ];
    for (const [action, transaction] of transactions) {
      const receipt = projectGitHubActionReceipt(action, { ...repo, ...transaction });
      expect(receipt, action).not.toBeNull();
      expect(readGitHubActionReceipt(JSON.stringify(receipt)), action).toEqual(receipt);
    }
  });
});
