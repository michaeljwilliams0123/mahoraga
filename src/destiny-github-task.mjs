const TASK_ID = /^dct-[a-f0-9]{24}$/;
const REPOSITORY = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const OWNER = /^[A-Za-z0-9_.-]+$/;
const MARKER = /<!-- MAHORAGA_DESTINY_TASK_V1\r?\n([\s\S]{1,12000}?)\r?\nMAHORAGA_DESTINY_TASK_V1 -->/;

function opaque(value, code, max = 512) {
  if (typeof value !== "string") throw new TypeError(code);
  const normalized = value.trim();
  if (!normalized || normalized.length > max || /[\0\r\n]/.test(normalized)) throw new TypeError(code);
  return normalized;
}

export function parseDestinyGithubTaskIssue(issue, { repository, owner }) {
  if (!issue || typeof issue !== "object" || Array.isArray(issue)) throw new TypeError("destiny-github-task-issue-invalid");
  if (typeof repository !== "string" || !REPOSITORY.test(repository)) throw new TypeError("destiny-github-task-repository-invalid");
  if (typeof owner !== "string" || !OWNER.test(owner)) throw new TypeError("destiny-github-task-owner-invalid");
  if (!Number.isSafeInteger(issue.number) || issue.number < 1) throw new TypeError("destiny-github-task-issue-invalid");
  if (issue.state !== "open") throw new TypeError("destiny-github-task-state-invalid");
  if (issue.pull_request != null) throw new TypeError("destiny-github-task-pr-invalid");
  if (issue.user?.login !== owner) throw new TypeError("destiny-github-task-author-invalid");
  if (typeof issue.body !== "string") throw new TypeError("destiny-github-task-body-invalid");
  const match = MARKER.exec(issue.body);
  if (!match) throw new TypeError("destiny-github-task-marker-missing");

  let payload;
  try { payload = JSON.parse(match[1]); } catch { throw new TypeError("destiny-github-task-json-invalid"); }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new TypeError("destiny-github-task-json-invalid");
  if (payload.schemaVersion !== 1 || payload.kind !== "destiny-codex-task") throw new TypeError("destiny-github-task-schema-invalid");
  if (typeof payload.taskId !== "string" || !TASK_ID.test(payload.taskId)) throw new TypeError("destiny-github-task-id-invalid");
  if (payload.repository !== repository) throw new TypeError("destiny-github-task-repository-mismatch");
  const prompt = opaque(payload.prompt, "destiny-github-task-prompt-invalid", 8000);
  if (payload.attempts !== 1 || payload.implementationOnly !== true || payload.codeReview !== false) {
    throw new TypeError("destiny-github-task-policy-invalid");
  }
  const keys = Object.keys(payload).sort().join(",");
  if (keys !== "attempts,codeReview,implementationOnly,kind,prompt,repository,schemaVersion,taskId") {
    throw new TypeError("destiny-github-task-schema-invalid");
  }
  return Object.freeze({ schemaVersion: 1, taskId: payload.taskId, repository, issueNumber: issue.number, prompt, attempts: 1, implementationOnly: true, codeReview: false });
}

export function buildCodexCloudExecArgs(environmentIdInput, task) {
  const environmentId = opaque(environmentIdInput, "destiny-codex-environment-id-invalid");
  if (!task || typeof task !== "object" || task.implementationOnly !== true || task.codeReview !== false || task.attempts !== 1) {
    throw new TypeError("destiny-github-task-policy-invalid");
  }
  return Object.freeze(["cloud", "exec", "--env", environmentId, "--attempts", "1", task.prompt]);
}
