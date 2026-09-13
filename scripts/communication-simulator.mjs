import { runCommunicationSimulation } from "../src/communication-simulator.mjs";

const report = await runCommunicationSimulation({
  ownerIdentity: process.env.MAHORAGA_SIM_OWNER ?? "simulation-owner@example.com",
  allowedOrigin: process.env.MAHORAGA_SIM_ORIGIN ?? "https://mahoraga.example",
  now: () => 0,
});

process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
if (!report.ok) process.exitCode = 1;
