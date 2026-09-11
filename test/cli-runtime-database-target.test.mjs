import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const ROOT = path.resolve(new URL("..", import.meta.url).pathname.replace(/^\/(?:[A-Za-z]:)/, (value) => value.slice(1)));
const TEST_VAULT_KEY = Buffer.alloc(32, 91).toString("base64");

test("CLI status honors explicit runtime database and vault targets cross-platform", async () => {
  const temp = await mkdtemp(path.join(tmpdir(), "mahoraga-cli-db-"));
  const databaseFile = path.join(temp, "candidate.sqlite");
  try {
    const result = spawnSync(process.execPath, ["src/cli.mjs", "status"], {
      cwd: ROOT,
      env: {
        ...process.env,
        MAHORAGA_DATABASE_FILE: databaseFile,
        MAHORAGA_CONTENT_VAULT_MASTER_KEY: TEST_VAULT_KEY,
      },
      encoding: "utf8",
      timeout: 15000,
    });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.equal(existsSync(databaseFile), true, "status should open the explicitly targeted runtime database");
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});
