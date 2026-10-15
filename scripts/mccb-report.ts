import { open } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { buildMccbReport } from "../src/mccb-report.ts";

async function main(args: string[]) {
  if (args.length !== 1) throw new Error("mccb-report-usage");
  const file = await open(args[0]!, "r");
  try {
    const metadata = await file.stat();
    if (!metadata.isFile() || metadata.size < 2 || metadata.size > 2 * 1024 * 1024) throw new Error("mccb-report-file-unavailable");
    // Bound allocation even if the file grows after the initial stat.
    const bytes = Buffer.alloc(2 * 1024 * 1024 + 1);
    let length = 0;
    while (length < bytes.length) {
      const result = await file.read(bytes, length, bytes.length - length, null);
      if (result.bytesRead === 0) break;
      length += result.bytesRead;
    }
    if (length < 2 || length > 2 * 1024 * 1024) throw new Error("mccb-report-file-unavailable");
    let input: unknown;
    try { input = JSON.parse(bytes.subarray(0, length).toString("utf8")); } catch { throw new Error("mccb-report-input-invalid"); }
    return buildMccbReport(input);
  } finally { await file.close(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { process.stdout.write(JSON.stringify(await main(process.argv.slice(2)), null, 2) + "\n"); }
  catch (error) {
    const allowed = new Set(["mccb-report-usage", "mccb-report-input-invalid", "mccb-report-provenance-mismatch",
      "mccb-report-duplicate", "mccb-report-undeclared-cell", "mccb-report-file-unavailable"]);
    const code = error instanceof Error && allowed.has(error.message) ? error.message : "mccb-report-file-unavailable";
    process.stderr.write(code + "\n");
    process.exitCode = 1;
  }
}
