import { spawn } from 'node:child_process';
import { access, realpath } from 'node:fs/promises';
import path from 'node:path';

// Validate that a string is a safe argument (no shell metacharacters)
// Note: spawn() passes args as array elements, NOT through shell interpretation.
// Only backticks, $(...), and ${ } for shell substitution are truly dangerous.
export function validateArgument(arg) {
  if (typeof arg !== 'string') throw new Error('argument-must-be-string');
  if (arg.length === 0) throw new Error('argument-empty');
  // Reject only genuine shell-substitution metacharacters and null bytes
  if (/[\x00`$\{]|\$\(/.test(arg)) throw new Error('argument-contains-shell-metacharacters');
  return arg;
}

// Validate an array of arguments
export function validateArguments(args) {
  if (!Array.isArray(args)) throw new Error('args-must-be-array');
  for (const arg of args) {
    // Allow strings and numbers; reject objects/arrays/nulls
    if (typeof arg !== 'string' && typeof arg !== 'number') {
      throw new Error('argument-invalid-type');
    }
    if (typeof arg === 'string') validateArgument(arg);
  }
  return args;
}

// Validate a working directory path
export function validateWorkingDirectory(dir) {
  if (typeof dir !== 'string' || dir.length === 0) throw new Error('working-directory-invalid');
  if (!path.isAbsolute(dir)) throw new Error('working-directory-not-absolute');
  if (dir.includes('..') || dir.includes('\x00')) throw new Error('working-directory-contains-traversal');
  return dir;
}

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
  // synchronous thin wrapper (fallback) - validates path and args
  if (!path.isAbsolute(executable)) throw new Error('executable-not-absolute');
  validateArguments(args);
  if (options.cwd) validateWorkingDirectory(options.cwd);
  return spawn(executable, args, { ...options, shell: false });
}

export function safeSpawn(executable, args = [], options = {}) {
  // Returns a child process; validates executable, args, and working directory
  if (typeof executable !== 'string' || executable.length === 0) throw new Error('executable-invalid');
  if (!path.isAbsolute(executable)) throw new Error('executable-not-absolute');
  validateArguments(args);
  if (options.cwd) validateWorkingDirectory(options.cwd);
  const opts = { ...options, shell: false };
  return spawn(executable, args, opts);
}
