import { mkdirSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { pathToFileURL } from "node:url";

type StableRuntime = { address: { port: number }; stop(): Promise<void> };
type StableRuntimeOptions = { port: number; databaseFile: string; artifactRoot: string; syncCoordinationMailbox: false };

const runtimeHome = path.join(os.homedir(), ".mahoraga-runtime");
const stableEntrypoint = path.join(runtimeHome, "windows-production-3.6.0", "src", "runtime.mjs");
const { startRuntime } = await import(pathToFileURL(stableEntrypoint).href) as {
  startRuntime: (options: StableRuntimeOptions) => Promise<StableRuntime>;
};
const stateDir = path.join(runtimeHome, "state", "candidate-stable-4783");
mkdirSync(stateDir, { recursive: true });
const runtime = await startRuntime({
  port: 4783,
  databaseFile: path.join(stateDir, "mahoraga.sqlite"),
  artifactRoot: path.join(stateDir, "artifacts"),
  syncCoordinationMailbox: false,
});
console.log("Mahoraga 3.6.0 isolated rollback candidate ready on 127.0.0.1:4783");
let stopping = false;
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, async () => {
    if (stopping) return;
    stopping = true;
    await runtime.stop();
    process.exit(0);
  });
}
