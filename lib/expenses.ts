export type Expense = { id: string; title: string; cents: number; date: string; category: string; notes: string; version?: number };
export type ExpenseRow = { id: string; title: string; amount_cents: number; spent_on: string; category: string; notes: string; version: number };
export function parseExpenses(raw: string | null): Expense[] {
  const data: unknown = raw ? JSON.parse(raw) : [];
  if (!Array.isArray(data) || !data.every((item) => item && typeof item.id === "string" && item.id.length > 0 && item.id.length <= 120 && typeof item.title === "string" && item.title.trim().length > 0 && item.title.length <= 160 && Number.isSafeInteger(item.cents) && item.cents > 0 && item.cents <= 99999999999 && typeof item.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(item.date) && !Number.isNaN(Date.parse(item.date)) && new Date(item.date).toISOString().slice(0, 10) === item.date && typeof item.category === "string" && item.category.length > 0 && item.category.length <= 100 && typeof item.notes === "string" && item.notes.length <= 2000) || new Set(data.map((item) => item.id)).size !== data.length) throw new Error("Invalid expense data");
  return data;
}
export function expenseRow(expense: Expense) {
  return { id: expense.id, title: expense.title, amount_cents: expense.cents, spent_on: expense.date, category: expense.category, notes: expense.notes };
}
export function expenseFromRow(row: ExpenseRow): Expense {
  return { id: row.id, title: row.title, cents: Number(row.amount_cents), date: row.spent_on, category: row.category, notes: row.notes, version: row.version };
}
