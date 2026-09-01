import fs from 'node:fs';
import path from 'node:path';

// Minimal codex federation helpers (quick narrow PR)
// Purpose: expose codex-like workers and produce a small federation record

export function readManifest(manifestPath = path.resolve(process.cwd(), 'mahoraga.manifest.json')) {
  const raw = fs.readFileSync(manifestPath, 'utf8');
  return JSON.parse(raw);
}

export function listCodexWorkers(manifest = null) {
  if (!manifest) manifest = readManifest();
  const workers = manifest.workers ?? [];
  // Heuristic: codex workers have "codex" or "question" or "destiny" in id/label
  return workers.filter((w) => {
    const id = String(w.id ?? '').toLowerCase();
    const label = String(w.label ?? '').toLowerCase();
    return /codex|question|destiny|primary|secondary|mahoraga/.test(id) || /codex|question|destiny|mahoraga/.test(label);
  });
}

export function createFederationRecord({ primary = 'primary-local-codex', secondary = 'primary-cloud-codex', note = '' } = {}) {
  const root = path.resolve(process.cwd());
  const dir = path.join(root, 'coordination', 'codex-federations');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const now = new Date().toISOString();
  const id = `cf-${now.replace(/[:.]/g, '-')}`;
  const record = {
    schemaVersion: 1,
    createdAt: now,
    primary,
    secondary,
    note,
  };
  const file = path.join(dir, `${id}.json`);
  fs.writeFileSync(file, JSON.stringify(record, null, 2) + '\n', 'utf8');
  return { path: `coordination/codex-federations/${id}.json`, record };
}
