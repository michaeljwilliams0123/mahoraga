import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import { transformSync } from "next/dist/build/swc/index.js";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
const dataModule = source => `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
const helper = dataModule(stripTypeScriptTypes(readFileSync(new URL("../lib/github-workspace.ts", import.meta.url), "utf8")));
const component = transformSync(readFileSync(new URL("../components/workspace/GithubWorkspacePanel.tsx", import.meta.url), "utf8"), { jsc: { parser: { syntax: "typescript", tsx: true }, transform: { react: { runtime: "automatic" } } }, module: { type: "es6" } }).code
  .replace('"react/jsx-runtime"', JSON.stringify(import.meta.resolve("react/jsx-runtime")))
  .replace('"react"', JSON.stringify(import.meta.resolve("react")))
  .replace('"@/lib/github-workspace"', JSON.stringify(helper));
const { GithubWorkspaceView } = await import(dataModule(component));
const snapshot = { repository: "michaeljwilliams0123/mahoraga", observedAt: "2026-10-05T13:00:00Z", readOnly: true, pages: { state: "denied", url: null, status: null, buildType: null, reason: "github-native-http-403" }, actions: { state: "available", runs: [{ id: 42, name: "Verify", conclusion: "failure", status: "completed", sha: "a".repeat(40), branch: "main", url: "https://untrusted.example", updatedAt: null }], failedRunId: 42, failedJobs: [{ name: "Ubuntu", steps: ["Typecheck"] }], reason: null, failureDetailsReason: null } };
const render = coreReady => renderToStaticMarkup(createElement(GithubWorkspaceView, { coreReady, canRefresh: true, state: { phase: "ready", snapshot }, publishedCommit: "b".repeat(40), onRefresh: () => { throw new Error("Rendering must not initiate a request"); } }));
test("Pages denial leaves readable Actions and failed-step details visible", () => {
  const html = render(true);
  assert.match(html, /Pages access denied/);
  assert.match(html, /Verify/);
  assert.match(html, /Ubuntu · Typecheck/);
  assert.match(html, /Published UI commit/);
  assert.match(html, /https:\/\/github.com\/michaeljwilliams0123\/mahoraga\/actions\/runs\/42/);
  assert.doesNotMatch(html, /untrusted.example/);
});
test("disconnect hides cached run and failure details", () => {
  const html = render(false);
  assert.match(html, /Connect to Mahoraga/);
  assert.doesNotMatch(html, /Ubuntu|Typecheck|Pages access denied|actions\/runs\/42/);
});
