import test from 'node:test';
import assert from 'node:assert/strict';
import { monthLedger, readBudgets } from '../lib/expense-budget.ts';

test('daily balance uses cents, includes quiet days and allows overspending', () => {
  const days = monthLedger('2026-11', [{date:'2026-11-01', cents:1250}, {date:'2026-11-01', cents:750}, {date:'2026-11-03', cents:9000}, {date:'2026-10-31', cents:500}], 10000);
  assert.equal(days.length, 30);
  assert.equal(days[0].cents, 2000);
  assert.equal(days[1].remaining, 8000);
  assert.equal(days[2].remaining, -1000);
  assert.equal(days[29].remaining, -1000);
});
test('budgets stay separate by month and distinguish zero from unset', () => {
  const budgets = readBudgets('{"2026-11":100000,"2026-12":0}');
  assert.equal(budgets['2026-11'], 100000);
  assert.equal(monthLedger('2026-12', [], budgets['2026-12'])[0].remaining, 0);
  assert.equal(monthLedger('2026-10', [], budgets['2026-10'])[0].remaining, undefined);
  assert.equal(monthLedger('2028-02', [], 0).length, 29);
  for (const value of ['[]', '{"2026-13":100}', '{"2026-11":-1}', '{"2026-11":1.2}']) assert.throws(() => readBudgets(value));
});

test('compact daily view follows today and month boundaries without altering balances', async () => {
  const { recentLedgerDays } = await import('../lib/expense-budget.ts');
  const ledger = monthLedger('2026-11', [{date:'2026-11-01', cents:1000}], 10000);
  const recent = recentLedgerDays(ledger, '2026-11-20');
  assert.equal(recent.length, 7);
  assert.equal(recent[0].date, '2026-11-14');
  assert.equal(recent[6].date, '2026-11-20');
  assert.equal(recent[0].remaining, 9000);
  assert.equal(recentLedgerDays(ledger, '2026-11-03').length, 3);
  assert.equal(recentLedgerDays(ledger, '2026-12-01')[0].date, '2026-11-24');
  assert.equal(recentLedgerDays(ledger, '2026-10-31')[6].date, '2026-11-07');
  assert.deepEqual(recentLedgerDays([], '2026-11-20'), []);
});
