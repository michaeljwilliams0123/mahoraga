import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  discoverHuggingFace,
  probeHuggingFaceLocalReadiness,
  scoreHuggingFaceBenchmark,
} from "../src/hugging-face-integration.ts";

const MAX_INPUT_BYTES = 16_384;

async function main(args: string[]) {
  const [action, ...rest] = args;
  if (action === "models" || action === "papers") {
    const query = rest.join(" ");
    const result = await discoverHuggingFace(action, query);
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  if (action === "local" && rest.length === 0) {
    console.log(JSON.stringify(await probeHuggingFaceLocalReadiness(), null, 2));
    return;
  }
  if (action === "benchmark" && rest.length === 1) {
    const file = resolve(rest[0]!);
    const metadata = await stat(file);
    if (!metadata.isFile() || metadata.size > MAX_INPUT_BYTES) throw new Error("hf-benchmark-file-invalid");
    const raw = await readFile(file, "utf8");
    if (Buffer.byteLength(raw) > MAX_INPUT_BYTES) throw new Error("hf-benchmark-file-invalid");
    const input: unknown = JSON.parse(raw);
    if (!input || typeof input !== "object") throw new Error("hf-benchmark-file-invalid");
    console.log(JSON.stringify(scoreHuggingFaceBenchmark(input as Parameters<typeof scoreHuggingFaceBenchmark>[0]), null, 2));
    return;
  }
  throw new Error("usage: models <search> | papers <search> | local | benchmark <fixtures.json>");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((error: unknown) => {
    const message = error instanceof Error && /^(?:hf-|usage:)/.test(error.message)
      ? error.message : "hf-operation-failed";
    console.error(message);
    process.exitCode = 1;
  });
}
