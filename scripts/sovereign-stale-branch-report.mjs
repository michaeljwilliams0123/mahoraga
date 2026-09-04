import { execFileSync } from "node:child_process";

const raw = execFileSync("git", ["ls-remote", "--heads", "origin"], { encoding: "utf8" });
const leftoverSovereignBranches = raw.split(/\r?\n/)
  .map((line) => line.trim())
  .filter(Boolean)
  .map((line) => {
    const [sha, ref] = line.split(/\s+/);
    return { sha, name: String(ref ?? "").replace(/^refs\/heads\//, "") };
  })
  .filter((item) => item.name.startsWith("feature/sovereign-") && /^[a-f0-9]{40}$/.test(item.sha))
  .sort((left, right) => left.name.localeCompare(right.name));

process.stdout.write(JSON.stringify({
  schemaVersion: 1,
  leftoverSovereignBranches,
}, null, 2) + "\n");
