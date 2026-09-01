import path from 'node:path';
import fs from 'node:fs';
import { readManifest } from './codex-federation.mjs';

const STATE_DIR = path.resolve(process.cwd(), 'state');
const CACHE_FILE = path.join(STATE_DIR, 'codex-broker-cache.json');
const BUDGET_FILE = path.join(STATE_DIR, 'token-budgets.json');

function ensureStateDir() {
  if (!fs.existsSync(STATE_DIR)) fs.mkdirSync(STATE_DIR, { recursive: true });
}

export function loadCache() {
  ensureStateDir();
  try { return JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8')); } catch { return { summaries: {} }; }
}

export function saveCache(cache) {
  ensureStateDir();
  fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2) + '\n', 'utf8');
}

export function loadBudgets() {
  ensureStateDir();
  try { return JSON.parse(fs.readFileSync(BUDGET_FILE, 'utf8')); } catch { return { budgets: {} }; }
}

export function saveBudgets(budgets) {
  ensureStateDir();
  fs.writeFileSync(BUDGET_FILE, JSON.stringify(budgets, null, 2) + '\n', 'utf8');
}

export function summarizeQuestion(question) {
  // cheap built-in summarizer fallback: take first sentence and fingerprint
  const text = String(question ?? '').replace(/\s+/g, ' ').trim();
  const first = (text.split(/[.!?]\s+/)[0] || text).slice(0, 240);
  return { summary: first, fingerprint: `${first.slice(0,80)}:${text.length}` };
}

export function shouldEscalate(question, budgets) {
  // simple heuristic: long question or budget exhausted -> escalate
  const length = String(question ?? '').length;
  const sessionBudget = budgets?.budgets?.default ?? 10000; // token budget
  return length > 2000 || sessionBudget <= 0;
}

export function routeTask(task) {
  // task: { id, requestedOutcome, owner }
  const manifest = readManifest();
  const workers = manifest.workers ?? [];
  const workerSummary = workers.map((w) => ({ id: w.id, label: w.label })).slice(0, 10);
  const cache = loadCache();
  const budgets = loadBudgets();
  const fingerprint = summarizeQuestion(task.requestedOutcome).fingerprint;
  if (cache.summaries[fingerprint]) return { action: 'cached', summary: cache.summaries[fingerprint] };
  if (!shouldEscalate(task.requestedOutcome, budgets)) {
    const summ = summarizeQuestion(task.requestedOutcome);
    cache.summaries[summ.fingerprint] = { createdAt: new Date().toISOString(), summary: summ.summary, routedTo: 'question-model' };
    saveCache(cache);
    budgets.budgets = budgets.budgets || {}; budgets.budgets.default = (budgets.budgets.default ?? 10000) - 100; saveBudgets(budgets);
    return { action: 'question-model', summary: summ.summary, workers: workerSummary };
  }
  return { action: 'escalate', reason: 'long-or-budget', workers: workerSummary };
}

export default { routeTask };
