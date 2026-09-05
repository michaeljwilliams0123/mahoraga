import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildStewardLearningState } from '../src/steward-learning-state.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

const args = parseArgs(process.argv.slice(2));
const input = args.input ? JSON.parse(readFileSync(path.resolve(args.input), 'utf8')) : await loadRepositoryInput();
const state = buildStewardLearningState(input);
writeJson(args.output ?? path.join(ROOT, 'reports/steward-learning-state.json'), state);
writeJson(args.featOutput ?? path.join(ROOT, 'reports/steward-feat-ledger.json'), state.featLedger);
writeJson(args.foundryOutput ?? path.join(ROOT, 'reports/steward-agent-factory.json'), state.agentFactory);
process.stdout.write(`${JSON.stringify({ schemaVersion: 1, stateFingerprint: state.stateFingerprint, featCount: state.featLedger.feats.length, plannedChildren: state.agentFactory.plannedCount, zeroCredit: true })}\n`);

async function loadRepositoryInput() {
  const registryPath = path.join(ROOT, 'coordination/agent-factory/registry.json');
  if (!existsSync(registryPath)) throw new TypeError('steward-agent-registry-missing');
  const registry = JSON.parse(readFileSync(registryPath, 'utf8'));
  if (registry?.schemaVersion !== 1 || typeof registry.parentAgentId !== 'string' || !Array.isArray(registry.agents)) throw new TypeError('steward-agent-registry-invalid');
  const feats = loadFeatSubmissions(path.join(ROOT, 'coordination/agent-feats/submissions'));
  const [{ loadManifest }, { buildGapAudit }] = await Promise.all([import('../src/config.mjs'), import('../src/gap-audit.mjs')]);
  const audit = buildGapAudit(await loadManifest());
  const gaps = audit.open.map(({ id, state, priority, summary, dependency }) => ({ id, state, priority, summary, dependency }));
  return { parentAgentId: registry.parentAgentId, agents: registry.agents, feats, gaps };
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

function writeJson(file, value) {
  const target = path.resolve(file);
  mkdirSync(path.dirname(target), { recursive: true });
  const next = `${JSON.stringify(value, null, 2)}\n`;
  if (existsSync(target) && readFileSync(target, 'utf8') === next) return;
  writeFileSync(target, next, 'utf8');
}

function parseArgs(values) {
  const result = {};
  const mapping = new Map([['--input', 'input'], ['--output', 'output'], ['--feat-output', 'featOutput'], ['--foundry-output', 'foundryOutput']]);
  for (let index = 0; index < values.length; index += 2) {
    const key = mapping.get(values[index]);
    const value = values[index + 1];
    if (!key || typeof value !== 'string' || value.length < 1) throw new TypeError('steward-learning-argument-invalid');
    result[key] = value;
  }
  return result;
}
