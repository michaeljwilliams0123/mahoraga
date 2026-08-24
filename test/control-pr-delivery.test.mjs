import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { ROOT } from "../src/config.mjs";

const files = [
  ".github/workflows/cloud-task-gateway.yml",
  ".github/workflows/chromebook-control-plane.yml",
];

async function workflows() {
  return Promise.all(files.map(async (file) => [file, await readFile(path.join(ROOT, file), "utf8")]));
}

test("control records use deterministic branches and pull requests instead of direct main pushes", async () => {
  for (const [file, source] of await workflows()) {
    assert.match(source, /pull-requests: write/, file);
    assert.match(source, /git ls-remote --exit-code --heads origin/, file);
    assert.match(source, /gh pr list/, file);
    assert.match(source, /gh pr create/, file);
    assert.match(source, /git push origin "HEAD:refs\/heads\/\$\{?(?:control_branch|CONTROL_BRANCH)\}?"/, file);
    assert.doesNotMatch(source, /^\s*git push origin HEAD:main\s*$/m, file);
    assert.doesNotMatch(source, /^\s*git push .*--force/m, file);
  }
  const [gateway, chromebook] = (await workflows()).map(([, source]) => source);
  assert.match(gateway, /control\/cloud-gateway\/\$\{RECORD_ID\}/);
  assert.match(chromebook, /control\/chromebook\/\$\{MODE\}-\$\{GITHUB_RUN_ID\}/);
  assert.match(chromebook, /record_id="sec-\$\{GITHUB_RUN_ID\}"/);
  assert.match(chromebook, /record_id="ccx-\$\{GITHUB_RUN_ID\}"/);
  assert.doesNotMatch(chromebook, /chromebook-\$\{GITHUB_RUN_ID\}-\$\{GITHUB_RUN_ATTEMPT\}/);
});

test("existing control branches are reused only when paths and records agree", async () => {
  for (const [file, source] of await workflows()) {
    assert.match(source, /git merge-base origin\/main/, file);
    assert.match(source, /remote_paths="\$\(git diff --name-only/, file);
    assert.match(source, /Existing control branch contains conflicting paths; refusing to overwrite it\./, file);
    assert.match(source, /Existing control branch record conflicts with the validated/, file);
    assert.match(source, /Multiple pull requests exist for the deterministic control branch\./, file);
    assert.match(source, /non-open pull request; refusing to bypass its disposition\./, file);
  }
});

test("auto-merge is gated by registered successful checks", async () => {
  for (const [file, source] of await workflows()) {
    const registration = source.indexOf("statusCheckRollup");
    const checks = source.indexOf("gh pr checks");
    const merge = source.indexOf("gh pr merge");
    assert.ok(registration > -1 && checks > registration && merge > checks, file);
    assert.match(source, /gh pr checks .*--watch --fail-fast/, file);
    assert.match(source, /gh pr merge .*--auto --squash --delete-branch/, file);
    assert.match(source, /No pull-request checks registered; auto-merge remains disabled\./, file);
  }
});

test("read-only modes stay outside coordination publication", async () => {
  const chromebook = await readFile(path.join(ROOT, files[1]), "utf8");
  assert.match(chromebook, /if: inputs\.mode == 'status'/);
  assert.match(chromebook, /if: inputs\.mode == 'verify'/);
  assert.match(chromebook, /if: inputs\.mode == 'gap-audit'/);
  assert.match(chromebook, /if: inputs\.mode == 'secondary-assignment' \|\| inputs\.mode == 'codex-cloud-task'/);
  assert.match(chromebook, /not activated on \\`main\\` until pull-request checks and merge requirements succeed/);
  assert.doesNotMatch(chromebook, /OPENAI_API_KEY|\$\{\{\s*secrets\./);
});
