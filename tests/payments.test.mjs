import assert from "node:assert/strict";
import test from "node:test";
import { additionalPayments, amountPaid, balance, newProject, paymentChange, paymentHistory, profitFor, projectStage } from "../lib/projects.ts";

const today = "2026-11-17";
const project = (change = {}) => ({ ...newProject(today), id: "project-1", version: 1, price_cents: 100000, ...change });
const payment = (id, amount_cents, date = today) => ({ id, amount_cents, date });

test("multiple instalments update balance and count in their received months", () => {
  const item = project({ deposit_cents: 20000, deposit_date: "2026-09-01", cost_cents: 5000, cost_date: "2026-11-01" });
  Object.assign(item, paymentChange(item, { payments: [payment("one", 10000, "2026-10-01"), payment("two", 15000)] }, today));
  assert.equal(amountPaid(item), 45000);
  assert.equal(balance(item), 55000);
  assert.equal(profitFor([item], today, "2026-09"), 20000);
  assert.equal(profitFor([item], today, "2026-10"), 10000);
  assert.equal(profitFor([item], today, "2026-11"), 10000);
  assert.equal(profitFor([item], today), 40000);
  assert.equal(projectStage(item), 1);
});

test("full payment can precede completion and uses latest received date", () => {
  const item = project({ payments: [payment("one", 30000)] });
  Object.assign(item, paymentChange(item, { payments: [...item.payments, payment("two", 70000, "2026-11-01")] }, today));
  assert.equal(item.paid_date, today);
  assert.equal(item.completed_date, null);
  assert.equal(balance(item), 0);
  assert.equal(projectStage(item), 3);
  Object.assign(item, paymentChange(item, { completed_date: today }, today));
  assert.equal(balance(item), 0);
});

test("preserves legacy final payment amount when editing a project price or deposit", () => {
  const item = project({ deposit_cents: 20000, deposit_date: "2026-10-01", paid_date: today });
  delete item.payments;
  assert.equal(balance(item), 0);
  assert.equal(additionalPayments(item)[0].amount_cents, 80000);
  const changed = { ...item, ...paymentChange(item, { price_cents: 120000 }, today) };
  assert.equal(amountPaid(changed), 100000);
  assert.equal(balance(changed), 20000);
  assert.equal(changed.paid_date, null);
  assert.equal(paymentHistory(changed).length, 2);
});

test("rejects overpayments, reduced price below receipts and invalid payment data", () => {
  const item = project({ payments: [payment("one", 30000)] });
  for (const change of [
    { payments: [payment("one", 100001)] },
    { price_cents: 29999 },
    { deposit_cents: 80000, deposit_date: today },
    { payments: [payment("one", 0)] },
    { payments: [payment("one", -1)] },
    { payments: [payment("one", 1.5)] },
    { payments: [payment("one", Number.NaN)] },
    { payments: [payment("one", 1, "2026-11-18")] },
    { payments: [payment("one", 1, "2026-02-30")] },
    { payments: [payment("one", 1), payment("one", 1)] },
  ]) assert.throws(() => paymentChange(item, change, today));
});

test("a deposit covering the price becomes fully paid without double counting", () => {
  const item = project();
  Object.assign(item, paymentChange(item, { deposit_cents: 100000, deposit_date: today }, today));
  assert.equal(item.paid_date, today);
  assert.equal(balance(item), 0);
  assert.equal(profitFor([item], today), 100000);
});

test("published projects keep sufficient receipts and chronological payment dates", () => {
  const item = project({ completed_date: today, paid_date: today, published_date: today, payments: [payment("one", 100000)] });
  assert.throws(() => paymentChange(item, { price_cents: 120000 }, today));
  assert.throws(() => paymentChange(item, { published_date: "2026-11-01" }, today));
  const prepaid = project({ completed_date: today, paid_date: "2026-11-01", payments: [payment("one", 100000, "2026-11-01")] });
  assert.throws(() => paymentChange(prepaid, { published_date: "2026-11-02" }, today));
});
