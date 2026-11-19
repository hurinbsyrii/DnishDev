export function readBudgets(raw: string | null): Record<string, number> {
  const value: unknown = raw ? JSON.parse(raw) : {};
  if (!value || typeof value !== "object" || Array.isArray(value) || !Object.entries(value).every(([month, cents]) => /^\d{4}-(0[1-9]|1[0-2])$/.test(month) && typeof cents === "number" && Number.isSafeInteger(cents) && cents >= 0)) throw new Error("Invalid budgets");
  return value as Record<string, number>;
}

export function monthLedger(month: string, expenses: { date: string; cents: number }[], budget: number | undefined) {
  const length = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5)), 0)).getUTCDate();
  const totals = new Map<string, number>();
  for (const expense of expenses) totals.set(expense.date, (totals.get(expense.date) ?? 0) + expense.cents);
  let spent = 0;
  return Array.from({ length }, (_, index) => {
    const date = `${month}-${String(index + 1).padStart(2, "0")}`;
    const cents = totals.get(date) ?? 0;
    spent += cents;
    return { date, cents, spent, remaining: budget === undefined ? undefined : budget - spent };
  });
}

export function recentLedgerDays<T extends { date: string }>(ledger: T[], today: string): T[] {
  if (!ledger.length) return [];
  const month = ledger[0].date.slice(0, 7);
  if (month > today.slice(0, 7)) return ledger.slice(0, 7);
  return ledger.filter((entry) => entry.date <= today).slice(-7);
}
