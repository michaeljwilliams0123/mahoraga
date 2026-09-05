import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyAgentFoundryPlans } from '../src/agent-foundry.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = parseArgs(process.argv.slice(2));
const registryPath = path.resolve(args.registry ?? path.join(ROOT, 'coordination/agent-factory/registry.json'));
const plansPath = path.resolve(args.plans ?? path.join(ROOT, 'reports/steward-agent-factory.json'));
const appliedPath = path.resolve(args.appliedOutput ?? path.join(ROOT, 'reports/steward-agent-foundry-applied.json'));
const registry = JSON.parse(readFileSync(registryPath, 'utf8'));
const planReport = JSON.parse(readFileSync(plansPath, 'utf8'));
if (planReport?.schemaVersion !== 1 || !Array.isArray(planReport.plans)) throw new TypeError('steward-agent-foundry-report-invalid');
const before = new Set(registry.agents?.map((agent) => agent.agentId) ?? []);
const next = applyAgentFoundryPlans(registry, planReport.plans);
const createdAgentIds = next.agents.map((agent) => agent.agentId).filter((id) => !before.has(id)).sort();
writeJsonIfChanged(registryPath, next);
if (createdAgentIds.length > 0) writeJsonIfChanged(appliedPath, { schemaVersion: 1, createdAgentIds, zeroCredit: true, ownerApprovalRequired: false, platformAuthorizationRequired: true });
process.stdout.write(`${JSON.stringify({ schemaVersion: 1, createdCount: createdAgentIds.length, createdAgentIds, zeroCredit: true })}\n`);

function writeJsonIfChanged(file, value) {
  mkdirSync(path.dirname(file), { recursive: true });
  const next = `${JSON.stringify(value, null, 2)}\n`;
  if (existsSync(file) && readFileSync(file, 'utf8') === next) return;
  writeFileSync(file, next, 'utf8');
}
function parseArgs(values) {
  const result = {};
  const mapping = new Map([['--registry', 'registry'], ['--plans', 'plans'], ['--applied-output', 'appliedOutput']]);
  for (let index = 0; index < values.length; index += 2) {
    const key = mapping.get(values[index]);
    const value = values[index + 1];
    if (!key || typeof value !== 'string' || value.length < 1) throw new TypeError('steward-agent-foundry-argument-invalid');
    result[key] = value;
  }
  return result;
}
