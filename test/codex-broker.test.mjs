import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeQuestion, shouldEscalate, loadCache, loadBudgets } from '../src/codex-broker.mjs';

test('summarizeQuestion extracts first sentence and creates fingerprint', () => {
  const result = summarizeQuestion('What is cloud computing? Explain it briefly.');
  assert.match(result.summary, /What is cloud computing/);
  assert.match(result.fingerprint, /:/);
  assert.ok(result.fingerprint.length > 20);
});

test('summarizeQuestion handles empty input safely', () => {
  const result = summarizeQuestion('');
  assert.equal(result.summary, '');
  assert.match(result.fingerprint, /:/);
});

test('shouldEscalate returns false for short questions within budget', () => {
  const budgets = { budgets: { default: 5000 } };
  const short = 'What is this?';
  assert.equal(shouldEscalate(short, budgets), false);
});

test('shouldEscalate returns true when budget exhausted', () => {
  const budgets = { budgets: { default: 0 } };
  const question = 'What is this?';
  assert.equal(shouldEscalate(question, budgets), true);
});

test('shouldEscalate returns true for very long questions', () => {
  const budgets = { budgets: { default: 10000 } };
  const long = 'a'.repeat(2500);
  assert.equal(shouldEscalate(long, budgets), true);
});

test('cache and budget files load defaults when missing', () => {
  const cache = loadCache();
  assert.ok(cache.summaries);
  assert.equal(typeof cache.summaries, 'object');
  
  const budgets = loadBudgets();
  assert.ok(budgets.budgets);
  assert.equal(typeof budgets.budgets, 'object');
});
