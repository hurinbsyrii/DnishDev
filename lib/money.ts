export const maxCents = 99_999_999_999;
export const maxItems = 50;
const monthPattern = /^\d{4}-(0[1-9]|1[0-2])$/;

export type MoneyAccount = { id: string; name: string; cents: number };
export type PlanItem = { id: string; name: string; cents: number; daily: boolean };
export type MoneySheet = {
  /** Month the current budget was started for, e.g. "2026-11". */
  month: string;
  budget_cents: number;
  /** Money kept aside. Can be negative while a month's income has not arrived yet. */
  emergency_cents: number;
  accounts: MoneyAccount[];
  plan: PlanItem[];
};
export type MoneyRow = MoneySheet & { version: number };

export function daysInMonth(month: string) {
  const date = new Date(0);
  date.setUTCFullYear(Number(month.slice(0, 4)), Number(month.slice(5)), 0);
  return date.getUTCDate();
}

/** Days still to come in this month, not counting today (27 Nov → 3). */
export function daysLeft(today: string) {
  return daysInMonth(today.slice(0, 7)) - Number(today.slice(8, 10));
}

export const sum = (items: { cents: number }[]) => items.reduce((total, item) => total + item.cents, 0);
export const planItemTotal = (item: PlanItem, days: number) => item.daily ? item.cents * days : item.cents;

export function moneySummary(sheet: MoneySheet, today: string) {
  const total = sum(sheet.accounts);
  const left = total - sheet.emergency_cents;
  const days = daysLeft(today);
  const planned = sheet.plan.reduce((value, item) => value + planItemTotal(item, days), 0);
  return { total, left, days, planned, unplanned: left - planned, spent: sheet.budget_cents - left };
}

function deposit(accounts: MoneyAccount[], accountId: string, cents: number) {
  return cents ? accounts.map((item) => item.id === accountId ? { ...item, cents: item.cents + cents } : item) : accounts;
}

/**
 * Starts a month: everything above the budget, including last month's leftover
 * and any income above the budget, becomes emergency money, so exactly the
 * budget is left to spend.
 */
export function startMonth(sheet: MoneySheet, month: string, budget: number, income: number, accountId: string): MoneySheet {
  const accounts = deposit(sheet.accounts, accountId, income);
  return { ...sheet, month, budget_cents: budget, accounts, emergency_cents: sum(accounts) - budget };
}

/** Income that arrives after the month has started goes straight to emergency money. */
export function addIncome(sheet: MoneySheet, income: number, accountId: string): MoneySheet {
  return { ...sheet, accounts: deposit(sheet.accounts, accountId, income), emergency_cents: sheet.emergency_cents + income };
}

export function newSheet(month: string, id: () => string = () => crypto.randomUUID()): MoneySheet {
  return {
    month,
    budget_cents: 200_000,
    emergency_cents: 0,
    accounts: ["Cash", "Bank Rakyat", "BSN"].map((name) => ({ id: id(), name, cents: 0 })),
    plan: [
      { id: id(), name: "Food", cents: 0, daily: true },
      { id: id(), name: "Minyak", cents: 0, daily: false },
      { id: id(), name: "Fun", cents: 0, daily: false },
    ],
  };
}

/**
 * Evaluates notepad-style math such as "30*3", "200+1+558" or "558 - 12.50".
 * Returns ringgit, or undefined when the text is not a complete expression.
 */
export function evaluate(input: string): number | undefined {
  const source = input.replace(/rm/gi, "").replace(/[\s,]/g, "").replace(/[x×]/gi, "*").replace(/÷/g, "/");
  if (!source) return undefined;
  let index = 0;
  const fail = () => { throw new Error("Invalid expression"); };
  function factor(): number {
    const char = source[index];
    if (char === "-" || char === "+") { index++; const value = factor(); return char === "-" ? -value : value; }
    if (char === "(") {
      index++;
      const value = expression();
      if (source[index++] !== ")") fail();
      return value;
    }
    const match = /^(\d+\.?\d*|\.\d+)/.exec(source.slice(index));
    if (!match) fail();
    index += match![0].length;
    return Number(match![0]);
  }
  function term(): number {
    let value = factor();
    while (source[index] === "*" || source[index] === "/") {
      const operator = source[index++];
      const right = factor();
      value = operator === "*" ? value * right : value / right;
    }
    return value;
  }
  function expression(): number {
    let value = term();
    while (source[index] === "+" || source[index] === "-") {
      const operator = source[index++];
      const right = term();
      value = operator === "+" ? value + right : value - right;
    }
    return value;
  }
  try {
    const value = expression();
    return index === source.length && Number.isFinite(value) ? value : undefined;
  } catch {
    return undefined;
  }
}

export const toCents = (ringgit: number) => Math.round(ringgit * 100);
/** Plain number for an input: 55800 → "558", 12350 → "123.50". */
export const plainAmount = (cents: number) => cents % 100 === 0 ? String(cents / 100) : (cents / 100).toFixed(2);

export function sheetError(sheet: MoneySheet): string | undefined {
  const isCents = (value: unknown, min = 0) => typeof value === "number" && Number.isSafeInteger(value) && value >= min && value <= maxCents;
  const validItems = (items: unknown, plan: boolean) => Array.isArray(items) && items.length <= maxItems
    && items.every((item) => item && typeof item.id === "string" && item.id.length > 0 && item.id.length <= 120
      && typeof item.name === "string" && item.name.length <= 100 && isCents(item.cents) && (!plan || typeof item.daily === "boolean"))
    && new Set(items.map((item) => item.id)).size === items.length;
  if (typeof sheet.month !== "string" || !monthPattern.test(sheet.month)) return "Invalid month.";
  if (!isCents(sheet.budget_cents)) return "Enter a valid monthly budget.";
  if (!isCents(sheet.emergency_cents, -maxCents)) return "Emergency money is out of range.";
  if (!validItems(sheet.accounts, false)) return "Each account needs a valid balance (up to 50 accounts).";
  if (!validItems(sheet.plan, true)) return "Each plan item needs a valid amount (up to 50 items).";
}

export function readDemoSheet(raw: string | null): MoneyRow | null {
  if (!raw) return null;
  const value = JSON.parse(raw);
  if (!value || !Number.isSafeInteger(value.version) || value.version < 1 || sheetError(value)) throw new Error("Invalid money sheet");
  const { month, budget_cents, emergency_cents, accounts, plan, version } = value as MoneyRow;
  return { month, budget_cents, emergency_cents, accounts, plan, version };
}
