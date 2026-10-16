import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateCandidateReceipt } from "../src/cloud-cycle-worker.mjs";

export function projectCandidateReceipt(cycle) {
  if (cycle?.status !== "candidate-ready") return null;
  if (!/^[a-f0-9]{64}$/.test(cycle.cycleId ?? "") ||
      !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(cycle.windowStartUtc ?? "")) {
    throw new TypeError("candidate cycle provenance is invalid");
  }
  const candidate = validateCandidateReceipt(cycle.candidate);
  return Object.freeze({
    schemaVersion: 1,
    kind: "sovereign-candidate-receipt",
    status: "candidate-ready",
    cycleId: cycle.cycleId,
    windowStartUtc: cycle.windowStartUtc,
    ...candidate,
    creditCost: 0,
    paidFallback: false,
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const input = JSON.parse(readFileSync(0, "utf8"));
  const receipt = projectCandidateReceipt(input);
  if (receipt) {
    if (!process.env.RUNNER_TEMP) throw new Error("RUNNER_TEMP is required");
    writeFileSync(path.join(process.env.RUNNER_TEMP, "sovereign-candidate-receipt.json"), JSON.stringify(receipt) + "\n", { flag: "wx" });
  }
}
