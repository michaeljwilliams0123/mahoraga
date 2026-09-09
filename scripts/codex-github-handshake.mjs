#!/usr/bin/env node
import { chmod, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createCodexIdentity, createRepositoryHandshake, verifyCodexIdentity, verifyRepositoryHandshake } from "../src/codex-github-handshake.mjs";

const root = path.resolve(import.meta.dirname, "..");
const command = process.argv[2];
const value = (name) => {
  const index = process.argv.indexOf(`--${name}`);
  return index < 0 ? null : process.argv[index + 1];
};

if (command === "enroll") {
  const repository = value("repository") ?? "michaeljwilliams0123/mahoraga";
  const actor = value("github-actor") ?? repository.split("/")[0];
  const identity = createCodexIdentity({ label: value("label") ?? "Codex Workspace Primary", repository, githubActor: actor });
  const directory = path.join(root, "coordination", "controller-identities");
  const keyDirectory = path.join(homedir(), ".mahoraga", "codex-identities");
  await mkdir(directory, { recursive: true });
  await mkdir(keyDirectory, { recursive: true, mode: 0o700 });
  const keyFile = path.join(keyDirectory, `${identity.registration.instanceId}.pem`);
  await writeFile(keyFile, identity.privateKey, { mode: 0o600, flag: "wx" });
  await chmod(keyFile, 0o600);
  const handshake = createRepositoryHandshake({ registration: identity.registration, privateKey: identity.privateKey, baseCommit: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim() });
  await writeFile(path.join(directory, `${identity.registration.instanceId}.json`), `${JSON.stringify({ registration: identity.registration, handshake }, null, 2)}\n`, { flag: "wx" });
  process.stdout.write(`${identity.registration.instanceId}\nPrivate key: ${keyFile}\n`);
} else if (command === "verify") {
  const file = path.resolve(root, value("file") ?? "");
  const record = JSON.parse(await readFile(file, "utf8"));
  verifyCodexIdentity(record.registration);
  verifyRepositoryHandshake(record.registration, record.handshake);
  process.stdout.write(`${record.registration.instanceId}: verified\n`);
} else if (command === "validate") {
  const directory = path.join(root, "coordination", "controller-identities");
  const files = (await readdir(directory)).filter((file) => file.endsWith(".json")).sort();
  const ids = new Set();
  for (const name of files) {
    const record = JSON.parse(await readFile(path.join(directory, name), "utf8"));
    verifyCodexIdentity(record.registration);
    verifyRepositoryHandshake(record.registration, record.handshake);
    if (name !== `${record.registration.instanceId}.json` || ids.has(record.registration.instanceId)) throw new TypeError("codex-handshake-record-invalid");
    ids.add(record.registration.instanceId);
  }
  process.stdout.write(`Codex GitHub handshakes valid: ${files.length} identity record(s).\n`);
} else {
  process.stderr.write("Usage: node scripts/codex-github-handshake.mjs enroll|verify|validate [options]\n");
  process.exitCode = 2;
}
