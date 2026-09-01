#!/usr/bin/env node
import { routeTask, loadBudgets, saveBudgets } from '../src/codex-broker.mjs';

const cmd = process.argv[2] || 'help';
if (cmd === 'route') {
  const taskJson = process.argv[3] || '{}';
  const task = JSON.parse(taskJson);
  const result = routeTask(task);
  console.log(JSON.stringify(result, null, 2));
} else if (cmd === 'budget') {
  const op = process.argv[3];
  const budgets = loadBudgets();
  if (op === 'status') console.log(JSON.stringify(budgets, null, 2));
  else if (op === 'reset') { budgets.budgets = {}; saveBudgets(budgets); console.log('reset'); }
  else console.log('Usage: node scripts/codex-broker.mjs <route|budget> [taskJson|status|reset]');
} else {
  console.log('Usage: node scripts/codex-broker.mjs route <taskJson>');
  process.exitCode = 2;
}
