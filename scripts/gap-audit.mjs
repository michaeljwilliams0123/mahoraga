import { loadManifest } from "../src/config.mjs";
import { buildGapAudit } from "../src/gap-audit.mjs";

const report = buildGapAudit(await loadManifest());
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
