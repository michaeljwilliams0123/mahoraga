import test from 'node:test';
import assert from 'node:assert/strict';
import { validateArgument, validateArguments, validateWorkingDirectory } from '../src/safe-exec.mjs';

test('validateArgument rejects shell metacharacters', () => {
  const dangerous = ['test`cmd`', 'test$(cmd)', 'test${var}', 'test\x00null'];
  for (const arg of dangerous) {
    assert.throws(() => validateArgument(arg), /shell-metacharacters/);
  }
});


test('validateArgument rejects null bytes', () => {
  assert.throws(() => validateArgument('test\x00arg'), /shell-metacharacters/);
});

test('validateArgument accepts normal strings', () => {
  const valid = ['--help', '-C', '/path/to/file', 'approval_policy="never"', 'read-only', '123', 'value.with.dots'];
  for (const arg of valid) {
    assert.equal(validateArgument(arg), arg);
  }
});

test('validateArgument rejects empty string', () => {
  assert.throws(() => validateArgument(''), /empty/);
});

test('validateArgument rejects non-string', () => {
  assert.throws(() => validateArgument(123), /must-be-string/);
  assert.throws(() => validateArgument(null), /must-be-string/);
  assert.throws(() => validateArgument(undefined), /must-be-string/);
});

test('validateArguments accepts array of valid strings', () => {
  const args = ['exec', '--ephemeral', '--sandbox', 'read-only'];
  const result = validateArguments(args);
  assert.deepEqual(result, args);
});

test('validateArguments accepts numbers', () => {
  const args = ['test', 123, 'arg'];
  const result = validateArguments(args);
  assert.deepEqual(result, args);
});

test('validateArguments rejects non-array', () => {
  assert.throws(() => validateArguments('not-array'), /args-must-be-array/);
});

test('validateArguments rejects invalid argument types', () => {
  assert.throws(() => validateArguments(['valid', null, 'arg']), /argument-invalid-type/);
  assert.throws(() => validateArguments(['valid', {}, 'arg']), /argument-invalid-type/);
});

test('validateWorkingDirectory requires absolute path', () => {
  assert.throws(() => validateWorkingDirectory('relative/path'), /not-absolute/);
  assert.throws(() => validateWorkingDirectory(''), /invalid/);
});

test('validateWorkingDirectory rejects path traversal', () => {
  assert.throws(() => validateWorkingDirectory('C:\\path\\..\\etc'), /traversal/);
});

test('validateWorkingDirectory rejects null bytes', () => {
  assert.throws(() => validateWorkingDirectory('C:\\path\x00hack'), /traversal/);
});

test('validateWorkingDirectory accepts valid absolute paths', () => {
  const validPaths = ['/tmp/test', 'C:\\Users\\Test', '/home/user/project'];
  for (const path of validPaths) {
    const result = validateWorkingDirectory(path);
    assert.equal(result, path);
  }
});
