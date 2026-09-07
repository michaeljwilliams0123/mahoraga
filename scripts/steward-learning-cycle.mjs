import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildStewardLearningState } from '../src/steward-learning-state.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPORTS = Object.freeze({
  memory: path.join(ROOT, 'reports/steward-institutional-memory.json'),
  objectives: path.join(ROOT, 'reports/steward-objective-economy.json'),
  organization: path.join(ROOT, 'reports/steward-organization.json'),
});

const args = parseArgs(process.argv.slice(2));
const input = args.input ? JSON.parse(readFileSync(path.resolve(args.input), 'utf8')) : await loadRepositoryInput();
const state = buildStewardLearningState(input);
writeJson(args.output ?? path.join(ROOT, 'reports/steward-learning-state.json'), state);
writeJson(args.featOutput ?? path.join(ROOT, 'reports/steward-feat-ledger.json'), state.featLedger);
writeJson(args.foundryOutput ?? path.join(ROOT, 'reports/steward-agent-factory.json'), state.agentFactory);
writeJson(args.memoryOutput ?? REPORTS.memory, state.compounding.memory);
writeJson(args.objectivesOutput ?? REPORTS.objectives, state.compounding.objectives);
writeJson(args.organizationOutput ?? REPORTS.organization, state.compounding.organization);
process.stdout.write(`${JSON.stringify({
  schemaVersion: 1,
  stateFingerprint: state.stateFingerprint,
  featCount: state.featLedger.feats.length,
  reusableFeatCount: state.compounding.featLedger.reusableFeatIds.length,
  promotedCapabilities: state.compounding.promotedCapabilities,
  institutionalMemoryCount: state.compounding.memory.records.length,
  objectiveCount: state.compounding.objectives.length,
  plannedChildren: state.agentFactory.plannedCount,
  plannedUnits: state.compounding.organization.plans.length,
  zeroCredit: true,
})}\n`);

async function loadRepositoryInput() {
  const registryPath = path.join(ROOT, 'coordination/agent-factory/registry.json');
  if (!existsSync(registryPath)) throw new TypeError('steward-agent-registry-missing');
  const registry = JSON.parse(readFileSync(registryPath, 'utf8'));
  if (registry?.schemaVersion !== 1 || typeof registry.parentAgentId !== 'string' || !Array.isArray(registry.agents)) throw new TypeError('steward-agent-registry-invalid');
  const feats = loadFeatSubmissions(path.join(ROOT, 'coordination/agent-feats/submissions'));
  const [{ loadManifest }, { buildGapAudit }] = await Promise.all([import('../src/config.mjs'), import('../src/gap-audit.mjs')]);
  const audit = buildGapAudit(await loadManifest());
  const gaps = audit.open.map(({ id, state, priority, summary, dependency }) => ({
    id,
    state,
    priority,
    summary,
    dependency,
    workloadClass: inferWorkloadClass(id),
  }));
  const memory = readJsonOr(REPORTS.memory, { records: [] });
  const objectives = readJsonOr(REPORTS.objectives, []);
  const organization = readJsonOr(REPORTS.organization, { units: [] });
  return {
    parentAgentId: registry.parentAgentId,
    agents: registry.agents,
    feats,
    gaps,
    memoryRecords: Array.isArray(memory?.records) ? memory.records : [],
    existingObjectives: Array.isArray(objectives) ? objectives : [],
    existingUnits: Array.isArray(organization?.units) ? organization.units : [],
  };
}

function loadFeatSubmissions(directory) {
  if (!existsSync(directory)) return [];
  const feats = [];
  for (const name of readdirSync(directory).filter((value) => value.endsWith('.json')).sort()) {
    const parsed = JSON.parse(readFileSync(path.join(directory, name), 'utf8'));
    if (Array.isArray(parsed)) feats.push(...parsed);
    else feats.push(parsed);
  }
  return feats;
}

function readJsonOr(file, fallback) {
  if (!existsSync(file)) return fallback;
  try { return JSON.parse(readFileSync(file, 'utf8')); }
  catch { throw new TypeError(`steward-state-json-invalid:${path.basename(file)}`); }
}

function inferWorkloadClass(id) {
  if (id.includes('research')) return 'research';
  if (id.includes('artifact')) return 'analysis';
  if (id.includes('repository') || id.includes('verify')) return 'engineering';
  return 'operations';
}

function writeJson(file, value) {
  const target = path.resolve(file);
  mkdirSync(path.dirname(target), { recursive: true });
  const next = `${JSON.stringify(value, null, 2)}\n`;
  if (existsSync(target) && readFileSync(target, 'utf8') === next) return;
  writeFileSync(target, next, 'utf8');
}

function parseArgs(values) {
  const result = {};
  const mapping = new Map([
    ['--input', 'input'],
    ['--output', 'output'],
    ['--feat-output', 'featOutput'],
    ['--foundry-output', 'foundryOutput'],
    ['--memory-output', 'memoryOutput'],
    ['--objectives-output', 'objectivesOutput'],
    ['--organization-output', 'organizationOutput'],
  ]);
  for (let index = 0; index < values.length; index += 2) {
    const key = mapping.get(values[index]);
    const value = values[index + 1];
    if (!key || typeof value !== 'string' || value.length < 1) throw new TypeError('steward-learning-argument-invalid');
    result[key] = value;
  }
  return result;
}
