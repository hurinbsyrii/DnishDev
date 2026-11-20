export const maxBudgetCents = 99_999_999_999;
export const maxBudgetCategories = 50;
const monthPattern = /^\d{4}-(0[1-9]|1[0-2])$/;

export type BudgetAllocation = { name: string; cadence: "monthly" | "daily"; cents: number };
export type BudgetPlan = {
  amount_cents: number;
  spending_limit_cents: number | null;
  allocations: BudgetAllocation[];
};
export type BudgetRow = BudgetPlan & { month: string; version: number };

export function daysInMonth(month: string) {
  const date = new Date(0);
  date.setUTCFullYear(Number(month.slice(0, 4)), Number(month.slice(5)), 0);
  return date.getUTCDate();
}

export function allocationTotal(allocation: BudgetAllocation, days: number) {
  return allocation.cents * (allocation.cadence === "daily" ? days : 1);
}

export function categoryKey(name: string) {
  return name.trim().toLowerCase();
}

export function budgetPlanError(month: string, plan: BudgetPlan): string | undefined {
  const isAmount = (value: number) => Number.isSafeInteger(value) && value >= 0 && value <= maxBudgetCents;
  if (!isAmount(plan.amount_cents)) return "Enter a valid total amount available.";
  if (plan.spending_limit_cents !== null && (!isAmount(plan.spending_limit_cents) || plan.spending_limit_cents > plan.amount_cents)) {
    return "Your monthly budget must be between RM 0.00 and the total money available.";
  }
  if (!Array.isArray(plan.allocations) || plan.allocations.length > maxBudgetCategories) return "Add up to 50 budget categories.";
  if (plan.allocations.some((item) => !item || typeof item.name !== "string" || !item.name.trim() || item.name.length > 100 || !isAmount(item.cents) || (item.cadence !== "monthly" && item.cadence !== "daily"))) {
    return "Each category needs a name and a valid amount.";
  }
  if (new Set(plan.allocations.map((item) => categoryKey(item.name))).size !== plan.allocations.length) return "Use a different name for each category.";
  const days = daysInMonth(month);
  if (plan.allocations.length && (plan.spending_limit_cents === null || plan.allocations.reduce((sum, item) => sum + allocationTotal(item, days), 0) > plan.spending_limit_cents)) {
    return "Category allocations must fit within your monthly budget.";
  }
}

export function readBudgets(raw: string | null): Record<string, number> {
  const value: unknown = raw ? JSON.parse(raw) : {};
  if (!value || typeof value !== "object" || Array.isArray(value) || !Object.entries(value).every(([month, cents]) => monthPattern.test(month) && typeof cents === "number" && Number.isSafeInteger(cents) && cents >= 0)) throw new Error("Invalid budgets");
  return value as Record<string, number>;
}

export function readDemoBudgetRows(raw: string | null): BudgetRow[] {
  const value: unknown = raw ? JSON.parse(raw) : {};
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid budgets");
  return Object.entries(value).map(([month, saved]) => {
    if (!monthPattern.test(month)) throw new Error("Invalid budget month");
    if (typeof saved === "number") {
      if (!Number.isSafeInteger(saved) || saved < 0) throw new Error("Invalid starting amount");
      return { month, amount_cents: saved, spending_limit_cents: null, allocations: [], version: 1 };
    }
    if (!saved || !Number.isSafeInteger(saved.version) || saved.version < 2 || budgetPlanError(month, saved)) throw new Error("Invalid budget plan");
    return { ...saved, month };
  });
}

export function monthLedger(month: string, expenses: { date: string; cents: number }[], budget: number | undefined) {
  const length = daysInMonth(month);
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
