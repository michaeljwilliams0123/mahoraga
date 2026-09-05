import { readFile } from "node:fs/promises";
import path from "node:path";
import { ROOT } from "../src/config.mjs";
import { readCreditFreeRuntime } from "../src/autonomy-heartbeat.mjs";
import { observeLocalReasonerReady, probeLocalReasoner } from "../src/local-reasoner-provider.mjs";
import { asHeartbeatCliReceipt, runUnattendedCreditFreeCycle } from "../src/unattended-credit-free-cycle.mjs";

const runtime = readCreditFreeRuntime();
let destinyManifest = null;
try {
  destinyManifest = JSON.parse(await readFile(path.join(ROOT, "config", "destiny-trigger-trust.json"), "utf8"));
} catch {
  destinyManifest = null;
}

let localReasonerReady = runtime.localReasonerReady;
let probe = null;
try {
  probe = await probeLocalReasoner({ timeoutMs: 750 });
  localReasonerReady = await observeLocalReasonerReady({ timeoutMs: 750 });
} catch {
  localReasonerReady = runtime.localReasonerReady;
}

const cycle = runUnattendedCreditFreeCycle({
  now: new Date(),
  ...runtime,
  localReasonerReady,
  destinyManifest,
  probe,
});
const receipt = asHeartbeatCliReceipt(cycle);
console.log(JSON.stringify(receipt));
if (receipt.nextAction === "refuse-paid-route") process.exitCode = 1;
