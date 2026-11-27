import test from 'node:test';
import assert from 'node:assert/strict';
import { addIncome, daysInMonth, daysLeft, evaluate, moneySummary, newSheet, plainAmount, readDemoSheet, sheetError, startMonth } from '../lib/money.ts';

// The notepad this page is modelled on, on 27 November.
const notepad = {
  month: '2026-11',
  budget_cents: 200000,
  emergency_cents: 62700,
  accounts: [
    { id: 'cash', name: 'Cash', cents: 20000 },
    { id: 'rakyat', name: 'Bank Rakyat', cents: 100 },
    { id: 'bsn', name: 'BSN', cents: 55800 },
  ],
  plan: [
    { id: 'food', name: 'Food', cents: 3000, daily: true },
    { id: 'minyak', name: 'Minyak', cents: 4200, daily: false },
    { id: 'fun', name: 'Fun', cents: 0, daily: false },
  ],
};

test('balances minus emergency money is what is left, and the plan uses the days left after today', () => {
  const summary = moneySummary(notepad, '2026-11-27');
  assert.equal(summary.total, 75900);
  assert.equal(summary.left, 13200);
  assert.equal(summary.days, 3);
  assert.equal(summary.planned, 13200);
  assert.equal(summary.unplanned, 0);
  assert.equal(summary.spent, 186800);
  assert.equal(moneySummary({ ...notepad, plan: notepad.plan.map((item) => item.id === 'minyak' ? { ...item, cents: 4000 } : item) }, '2026-11-27').unplanned, 200);
});

test('days left counts the rest of the month, including leap years', () => {
  assert.deepEqual(['2026-11', '2026-12', '2026-02', '2028-02'].map(daysInMonth), [30, 31, 28, 29]);
  assert.equal(daysLeft('2026-11-27'), 3);
  assert.equal(daysLeft('2026-11-30'), 0);
  assert.equal(daysLeft('2028-02-01'), 28);
});

test('starting a month moves the leftover and income above the budget into emergency money', () => {
  const next = startMonth(notepad, '2026-12', 200000, 250000, 'bsn');
  assert.equal(next.month, '2026-12');
  assert.equal(next.accounts.find((item) => item.id === 'bsn').cents, 305800);
  // 627 + 132 leftover + (2500 - 2000) = 1259
  assert.equal(next.emergency_cents, 125900);
  assert.equal(moneySummary(next, '2026-12-01').left, 200000);
  assert.equal(notepad.emergency_cents, 62700, 'does not change the original sheet');
});

test('late income: start the month first, then the income goes to emergency money', () => {
  const started = startMonth(notepad, '2026-12', 200000, 0, 'bsn');
  assert.equal(started.emergency_cents, 75900 - 200000);
  assert.equal(moneySummary(started, '2026-12-01').left, 200000);
  const paid = addIncome(started, 250000, 'bsn');
  assert.equal(paid.emergency_cents, 125900);
  assert.equal(moneySummary(paid, '2026-12-05').left, 200000);
});

test('income below the budget is covered from emergency money', () => {
  assert.equal(startMonth({ ...notepad, accounts: notepad.accounts.map((item) => ({ ...item })), plan: [] }, '2026-12', 200000, 180000, 'bsn').emergency_cents, 75900 + 180000 - 200000);
});

test('amount fields accept notepad math', () => {
  assert.equal(evaluate('30*3'), 90);
  assert.equal(evaluate('200 + 1 + 558'), 759);
  assert.equal(evaluate('759-627'), 132);
  assert.equal(evaluate('30 x 3'), 90);
  assert.equal(evaluate('RM 1,200.50'), 1200.5);
  assert.equal(evaluate('(10 + 5) * 2 / 3'), 10);
  assert.equal(evaluate('-12'), -12);
  assert.equal(evaluate('.5'), 0.5);
  for (const bad of ['', '558-', '1/0', '2**3', 'abc', '(1+2', '1)', 'alert(1)']) assert.equal(evaluate(bad), undefined, bad);
  assert.deepEqual([55800, 12350, 100, -124100, 5].map(plainAmount), ['558', '123.50', '1', '-1241', '0.05']);
});

test('sheet validation matches the database rules', () => {
  assert.equal(sheetError(notepad), undefined);
  assert.equal(sheetError({ ...notepad, emergency_cents: -1 }), undefined);
  assert.match(sheetError({ ...notepad, month: '2026-13' }), /month/);
  assert.match(sheetError({ ...notepad, accounts: [{ id: 'a', name: 'A', cents: -1 }] }), /account/);
  assert.match(sheetError({ ...notepad, accounts: [notepad.accounts[0], notepad.accounts[0]] }), /account/);
  assert.match(sheetError({ ...notepad, plan: [{ id: 'a', name: 'A', cents: 1 }] }), /plan/);
  assert.match(sheetError({ ...notepad, budget_cents: 1.5 }), /budget/);
  const fresh = newSheet('2026-11');
  assert.equal(sheetError(fresh), undefined);
  assert.equal(fresh.budget_cents, 200000);
  assert.deepEqual(fresh.accounts.map((item) => item.name), ['Cash', 'Bank Rakyat', 'BSN']);
});

test('demo sheets round-trip through browser storage and reject corrupt data', () => {
  assert.equal(readDemoSheet(null), null);
  assert.deepEqual(readDemoSheet(JSON.stringify({ ...notepad, version: 3, extra: true })), { ...notepad, version: 3 });
  assert.throws(() => readDemoSheet(JSON.stringify(notepad)));
  assert.throws(() => readDemoSheet(JSON.stringify({ ...notepad, version: 1, accounts: 'x' })));
});
