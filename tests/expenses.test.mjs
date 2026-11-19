import test from 'node:test';
import assert from 'node:assert/strict';
import { expenseRow, expenseFromRow, parseExpenses } from '../lib/expenses.ts';
const expense = { id: 'browser-id', title: 'Lunch', cents: 1250, date: '2026-11-20', category: 'Food & drinks', notes: 'Cafe' };
test('browser expense amounts, dates and notes survive cloud conversion', () => {
  const parsed = parseExpenses(JSON.stringify([expense]))[0];
  assert.deepEqual(expenseFromRow({ ...expenseRow(parsed), version: 3 }), { ...expense, version: 3 });
  assert.equal('version' in expenseRow({ ...expense, version: 3 }), false);
  assert.equal('user_id' in expenseRow(expense), false);
});
test('invalid or duplicate imports fail without silently losing entries', () => {
  assert.deepEqual(parseExpenses(null), []);
  for (const data of [[expense, expense], [{...expense, cents:-1}], [{...expense, date:'2026-02-30'}], [{...expense, title:' '}], [{...expense, cents:1.5}]]) assert.throws(() => parseExpenses(JSON.stringify(data)));
});
