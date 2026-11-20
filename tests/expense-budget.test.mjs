import test from 'node:test';
import assert from 'node:assert/strict';
import { allocationTotal, budgetPlanError, daysInMonth, monthLedger, readBudgets, readDemoBudgetRows } from '../lib/expense-budget.ts';

test('food allocations scale to the selected month and fixed allocations stay the same', () => {
  const food = { name: 'Food', cadence: 'daily', cents: 1500 };
  const savings = { name: 'Savings', cadence: 'monthly', cents: 1500 };
  const months = ['2026-12', '2026-11', '2026-02', '2028-02', '0100-02', '0004-02'];
  assert.deepEqual(months.map(daysInMonth), [31, 30, 28, 29, 28, 29]);
  assert.deepEqual(months.map((month) => allocationTotal(food, daysInMonth(month))), [46500, 45000, 42000, 43500, 42000, 43500]);
  assert.ok(months.every((month) => allocationTotal(savings, daysInMonth(month)) === 1500));
});

test('monthly plans validate the cash available, real month totals, and unique category names', () => {
  const food = { name: 'Makanan', cadence: 'daily', cents: 1500 };
  const plan = { amount_cents: 100000, spending_limit_cents: 45000, allocations: [food] };
  assert.equal(budgetPlanError('2026-11', plan), undefined);
  assert.match(budgetPlanError('2026-12', plan), /fit within/);
  assert.match(budgetPlanError('2026-11', { ...plan, spending_limit_cents: 100001 }), /total money available/);
  assert.match(budgetPlanError('2026-11', { ...plan, allocations: [food, { ...food, name: ' makanan ' }] }), /different name/);
  assert.match(budgetPlanError('2026-11', { ...plan, allocations: [{ ...food, cents: NaN }] }), /valid amount/);
  assert.equal(budgetPlanError('2026-11', { amount_cents: 0, spending_limit_cents: 0, allocations: [] }), undefined);
});

test('demo budgets can load legacy starting amounts alongside complete budget plans', () => {
  const plan = { amount_cents: 100000, spending_limit_cents: 70000, allocations: [{ name: 'Fun', cadence: 'monthly', cents: 5000 }], version: 2 };
  const stored = JSON.stringify({ '2026-11': plan, '2026-12': 50000 });
  assert.deepEqual(readDemoBudgetRows(stored), [
    { ...plan, month: '2026-11' },
    { month: '2026-12', amount_cents: 50000, spending_limit_cents: null, allocations: [], version: 1 },
  ]);
});

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
