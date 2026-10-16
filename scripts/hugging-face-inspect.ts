import { readFile, stat, mkdir, rename, writeFile } from "node:fs/promises";
import { resolve, dirname, join } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import { discoverHuggingFace, probeHuggingFaceLocalReadiness, scoreHuggingFaceBenchmark } from "../src/hugging-face-integration.ts";
import { scoutNativeHuggingFace, trialNativeHuggingFace, recallNativeHuggingFace, compareNativeHuggingFaceTrials } from "../src/hugging-face-native-learning.ts";

const MAX_INPUT_BYTES = 32_768;
const LEDGER = join(homedir(), ".mahoraga", "hf-native-learning.json");
const MAX_RECEIPTS = 32;
async function input(path: string): Promise<unknown> {
  const file = resolve(path);
  const metadata = await stat(file);
  if (!metadata.isFile() || metadata.size > MAX_INPUT_BYTES) throw Error("hf-input-file-invalid");
  const raw = await readFile(file, "utf8");
  if (Buffer.byteLength(raw) > MAX_INPUT_BYTES) throw Error("hf-input-file-invalid");
  return JSON.parse(raw) as unknown;
}
type Stored = { schemaVersion:1; receipts: unknown[] };
async function load(): Promise<Stored> {
  try {
    const raw = await readFile(LEDGER, "utf8");
    if (Buffer.byteLength(raw) > 196_608) throw Error("hf-ledger-invalid");
    const data = JSON.parse(raw) as Stored;
    if (data?.schemaVersion !== 1 || !Array.isArray(data.receipts) || data.receipts.length > MAX_RECEIPTS) throw Error("hf-ledger-invalid");
    return data;
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return { schemaVersion:1, receipts:[] };
    throw error;
  }
}
async function save(record: unknown): Promise<void> {
  const previous = await load();
  const current = { schemaVersion:1 as const, receipts:[...previous.receipts, record].slice(-MAX_RECEIPTS) };
  const payload = JSON.stringify(current);
  if (Buffer.byteLength(payload) > 196_608) throw Error("hf-ledger-capacity");
  await mkdir(dirname(LEDGER), { recursive:true });
  const temp = LEDGER + ".tmp-" + process.pid;
  await writeFile(temp, payload, { encoding:"utf8", flag:"wx", mode:0o600 });
  await rename(temp, LEDGER);
}
async function main(args: string[]) {
  const [action, ...rest] = args;
  if (action === "models" || action === "papers") {
    console.log(JSON.stringify(await discoverHuggingFace(action, rest.join(" ")), null, 2));
    return;
  }
  if (action === "local" && rest.length === 0) {
    console.log(JSON.stringify(await probeHuggingFaceLocalReadiness(), null, 2)); return;
  }
  if (action === "benchmark" && rest.length === 1) {
    const value = await input(rest[0]!);
    console.log(JSON.stringify(scoreHuggingFaceBenchmark(value as Parameters<typeof scoreHuggingFaceBenchmark>[0]), null, 2)); return;
  }
  if (action === "study" && rest.length > 0) {
    const receipt = await scoutNativeHuggingFace(rest.join(" "));
    await save(receipt);
    console.log(JSON.stringify(receipt, null, 2)); return;
  }
  if (action === "trial" && rest.length === 1) {
    const receipt = await trialNativeHuggingFace(await input(rest[0]!) as Parameters<typeof trialNativeHuggingFace>[0]);
    await save(receipt);
    console.log(JSON.stringify(receipt, null, 2)); return;
  }
  if (action === "recall" && rest.length === 1) {
    const receipt = await recallNativeHuggingFace(await input(rest[0]!) as Parameters<typeof recallNativeHuggingFace>[0]);
    await save(receipt);
    console.log(JSON.stringify(receipt, null, 2)); return;
  }
  if (action === "compare" && rest.length === 0) {
    const all = (await load()).receipts.filter(x => x && typeof x === "object" && "status" in x && x.status === "local-trial");
    console.log(JSON.stringify(compareNativeHuggingFaceTrials(all.slice(-12) as Parameters<typeof compareNativeHuggingFaceTrials>[0]), null, 2)); return;
  }
  if (action === "status" && rest.length === 0) {
    const data = await load();
    console.log(JSON.stringify({ schemaVersion:1, receiptCount:data.receipts.length,
      latest:data.receipts.at(-1) ?? null, executionMode:"local-only", productionActivated:false },null,2)); return;
  }
  throw Error("usage: models <query> | papers <query> | local | benchmark <file> | study <query> | trial <file> | recall <file> | compare | status");
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((e: unknown) => {
    console.error(e instanceof Error && /^(?:hf-|model-supply-chain-|local-ai-|transient-|semantic-|usage:)/.test(e.message) ? e.message : "hf-operation-failed");
    process.exitCode = 1;
  });
}
