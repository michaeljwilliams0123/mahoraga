import { spawn } from 'node:child_process';
import { access, realpath } from 'node:fs/promises';
import path from 'node:path';

// Minimal safe spawn helper: ensures executable exists and is an absolute path
export async function ensureExecutable(executable) {
  if (typeof executable !== 'string' || executable.length === 0) throw new Error('executable-invalid');
  if (!path.isAbsolute(executable)) throw new Error('executable-not-absolute');
  try {
    const resolved = await realpath(executable);
    await access(resolved);
    return resolved;
  } catch (error) {
    const e = new Error('executable-not-found');
    e.cause = error;
    throw e;
  }
}

export function safeSpawnSync(executable, args = [], options = {}) {
  // synchronous thin wrapper (fallback) - validates path only if provided as absolute
  if (!path.isAbsolute(executable)) throw new Error('executable-not-absolute');
  return spawn(executable, args, { ...options, shell: false });
}

export function safeSpawn(executable, args = [], options = {}) {
  // Returns a child process; does not await realpath to avoid blocking caller.
  // Prefer callers to validate via ensureExecutable when possible.
  if (typeof executable !== 'string' || executable.length === 0) throw new Error('executable-invalid');
  if (!Array.isArray(args)) throw new Error('args-must-be-array');
  const opts = { ...options, shell: false };
  return spawn(executable, args, opts);
}
