import { loadManifest } from "../src/config.mjs";
import { buildGapAudit } from "../src/gap-audit.mjs";

const report = buildGapAudit(await loadManifest());
const blockedGapIds = report.open
  .filter((item) => item.state === "blocked")
  .map((item) => item.id)
  .sort();
const actionableGapIds = report.open
  .filter((item) => item.state === "open" || item.state === "unverified")
  .map((item) => item.id)
  .sort();

process.stdout.write(JSON.stringify({
  schemaVersion: 1,
  product: report.product,
  version: report.version,
  counts: report.counts,
  blockedGapIds,
  actionableGapIds,
}, null, 2) + "\n");
