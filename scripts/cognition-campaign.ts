import { open } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { buildCognitionCampaignLedger } from "../src/cognition-campaign.ts";

async function boundedRead(path: string, limit: number) {
  const file = await open(path, "r");
  try {
    const stat = await file.stat();
    if (!stat.isFile() || stat.size < 2 || stat.size > limit) throw Error("cognition-campaign-file-unavailable");
    const bytes = Buffer.alloc(limit + 1); let length = 0;
    while (length < bytes.length) {
      const { bytesRead } = await file.read(bytes, length, bytes.length - length, null);
      if (bytesRead === 0) break; length += bytesRead;
    }
    if (length < 2 || length > limit) throw Error("cognition-campaign-file-unavailable");
    return bytes.subarray(0, length).toString("utf8");
  } finally { await file.close(); }
}
async function main(args: string[]) {
  if (args.length !== 3) throw Error("cognition-campaign-usage");
  const raw = await boundedRead(args[0]!, 2 * 1024 * 1024);
  let input: unknown; try { input = JSON.parse(raw); } catch { throw Error("cognition-campaign-input-invalid"); }
  return buildCognitionCampaignLedger(input, { expectedSourceSha: args[1]!, evaluatorPublicKeySpki: await boundedRead(args[2]!, 4096) });
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { process.stdout.write(JSON.stringify(await main(process.argv.slice(2)), null, 2) + "\n"); }
  catch (error) {
    const allowed = new Set(["usage", "file-unavailable", "input-invalid", "key-invalid", "signature-invalid", "source-mismatch", "provenance-mismatch", "undeclared-cell", "duplicate"].map(code => `cognition-campaign-${code}`));
    process.stderr.write((error instanceof Error && allowed.has(error.message) ? error.message : "cognition-campaign-file-unavailable") + "\n");
    process.exitCode = 1;
  }
}
