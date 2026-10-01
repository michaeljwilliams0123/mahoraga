import { readFileSync } from "node:fs";

import { validateCurrentHeadAssurance } from "./current-head-assurance.ts";

export function validateGitLabAssurance(input = {}, options = {}) {
  return validateCurrentHeadAssurance(input, options);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const raw = process.env.MAHORAGA_GITLAB_ASSURANCE_JSON || (process.stdin.isTTY ? "" : readFileSync(0, "utf8"));
  if (!raw.trim()) {
    console.error(JSON.stringify({ ok: false, reason: "assurance-input-missing" }));
    process.exit(1);
  }
  let input;
  try {
    if (Buffer.byteLength(raw) > 131_072) throw new Error("oversized");
    input = JSON.parse(raw);
    if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("invalid");
  } catch {
    console.error(JSON.stringify({ ok: false, reason: "assurance-input-invalid" }));
    process.exit(1);
  }
  // Resolve current source authority ourselves; matching caller ledgers are insufficient.
  let authoritativeMain;
  try {
    const response = await fetch("https://api.github.com/repos/michaeljwilliams0123/mahoraga/git/ref/heads/main", {
      headers: { accept: "application/vnd.github+json" }, redirect: "error", signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error("main-unavailable");
    const content = await response.text();
    if (Buffer.byteLength(content) > 65_536) throw new Error("main-response-too-large");
    authoritativeMain = { repositoryIdentity: "michaeljwilliams0123/mahoraga", commitSha: JSON.parse(content).object?.sha, observedAt: new Date().toISOString() };
  } catch { authoritativeMain = null; }
  const result = validateGitLabAssurance({ ...input, authoritativeMain });
  console.log(JSON.stringify(result));
  process.exit(result.ok ? 0 : 1);
}
