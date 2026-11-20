"use client";

import { useState, type FormEvent } from "react";
import Image from "next/image";
import { Download, Pencil, Plus, Trash2, Wallet } from "lucide-react";
import { formatDate, money } from "@/lib/projects";
import { allocationTotal, categoryKey, monthLedger, recentLedgerDays, type BudgetRow } from "@/lib/expense-budget";
import { useExpenses } from "@/lib/use-expenses";
import type { Expense } from "@/lib/expenses";
import { ExpensePlanEditor } from "./expense-plan-editor";
import { Modal } from "./ui";

const defaultCategories = ["Food & drinks", "Transport", "Shopping", "Bills & utilities", "Subscriptions", "Health", "Business", "Other"];
const total = (items: Expense[]) => items.reduce((sum, item) => sum + item.cents, 0);

export function Expenses({ owner, today }: { owner: string; today: string }) {
  const store = useExpenses(owner);
  const { expenses, ready } = store;
  const [error, setError] = useState("");
  const [budgetEditor, setBudgetEditor] = useState<{ previous?: BudgetRow } | null>(null);
  const [month, setMonth] = useState(today.slice(0, 7));
  const [showAllDays, setShowAllDays] = useState(false);
  const [day, setDay] = useState("");
  const [category, setCategory] = useState("");
  const [query, setQuery] = useState("");
  const [editor, setEditor] = useState<{ expense: Expense | null } | null>(null);
  const [deleting, setDeleting] = useState<Expense | null>(null);

  async function persist(previous: Expense | null, next: Expense | null) {
    try { await store.mutate(previous, next); setError(""); return true; }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Couldn’t save this expense."); return false; }
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editor) return;
    const form = new FormData(event.currentTarget);
    const cents = Math.round(Number(form.get("amount")) * 100);
    const title = String(form.get("title") ?? "").trim();
    if (!title || !Number.isSafeInteger(cents) || cents <= 0) { setError("Enter a description and a valid amount greater than zero."); return; }
    const expense: Expense = { id: editor.expense?.id ?? crypto.randomUUID(), title, cents, date: String(form.get("date")), category: String(form.get("category")), notes: String(form.get("notes") ?? "").trim() };
    if (await persist(editor.expense, expense)) setEditor(null);
  }

  const monthly = expenses.filter((item) => item.date.startsWith(month));
  const budgetRow = store.budgets.find((item) => item.month === month);
  const available = budgetRow?.amount_cents;
  const limit = budgetRow?.spending_limit_cents ?? undefined;
  const budget = limit ?? available;
  const spent = total(monthly);
  const remaining = budget === undefined ? undefined : budget - spent;
  const ledger = monthLedger(month, monthly, budget);
  const displayedDays = showAllDays ? ledger : recentLedgerDays(ledger, today);
  const monthLabel = formatDate(`${month}-01`, { month: "long", year: "numeric" });
  const visible = monthly.filter((item) => (!day || item.date === day) && (!category || categoryKey(item.category) === category) && `${item.title} ${item.notes}`.toLowerCase().includes(query.trim().toLowerCase())).sort((a, b) => b.date.localeCompare(a.date) || a.title.localeCompare(b.title));
  const days = [...new Set(visible.map((item) => item.date))];
  const allocations = budgetRow?.allocations ?? [];
  const categoryNames = new Map(defaultCategories.map((name) => [categoryKey(name), name]));
  const spentByCategory = new Map<string, number>();
  for (const item of monthly) {
    const key = categoryKey(item.category);
    categoryNames.set(key, item.category);
    spentByCategory.set(key, (spentByCategory.get(key) ?? 0) + item.cents);
  }
  for (const item of allocations) categoryNames.set(categoryKey(item.name), item.name);
  const breakdown = [...spentByCategory].map(([key, cents]) => ({ name: categoryNames.get(key)!, cents })).sort((a, b) => b.cents - a.cents);
  const planned = allocations.map((item) => ({
    ...item,
    monthlyCents: allocationTotal(item, ledger.length),
    spent: spentByCategory.get(categoryKey(item.name)) ?? 0,
  }));
  const unallocated = (limit ?? 0) - planned.reduce((sum, item) => sum + item.monthlyCents, 0);
  const expenseCategories = [...new Set([
    ...defaultCategories,
    ...store.budgets.flatMap((row) => row.allocations.map((item) => item.name)),
    ...expenses.map((item) => item.category),
  ])];
  function download() {
    const cell = (value: string) => `"${(/^[=+\-@\t\r]/.test(value) ? "'" : "") + value.replaceAll('"', '""')}"`;
    const csv = ["Date,Description,Category,Amount (MYR),Notes", ...visible.map((item) => [item.date, item.title, item.category, (item.cents / 100).toFixed(2), item.notes].map(cell).join(","))].join("\r\n");
    const url = URL.createObjectURL(new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a"); link.href = url; link.download = `expenses-${month}.csv`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return <section className="expenses-page" aria-label="Expenses">
    <div className="card todo-toolbar"><div className="todo-summary"><span className="metric-icon lavender"><Wallet size={19} /></span><div><strong>Your spending, in one place</strong><p className="muted">{store.cloud ? store.error ? "Cloud sync unavailable" : !ready ? "Connecting to Supabase…" : store.live ? "Saved in Supabase · Live sync across devices" : "Saved in Supabase · Checking for updates" : "Demo · Saved in this browser"}</p></div></div><button className="button primary" disabled={!ready || store.saving} onClick={() => setEditor({ expense: null })}><Plus size={16} /> New expense</button></div>
    {(store.error || store.importWarning) && <div className="error-banner" role="alert">{store.error || store.importWarning}<button className="button quiet" onClick={store.retry}>Retry</button></div>}
    {error && <p className="error-banner" role="alert">{error}</p>}
    <div className="card expense-budget">
      <div className="expense-day-heading">
        <div className="budget-heading"><div><p className="eyebrow">MONTHLY MONEY PLAN</p><h2>{monthLabel}</h2></div>
          {remaining !== undefined && remaining < 0
            ? <Image className="mascot mascot-budget" src="/mascot/worried.webp" alt="" width={331} height={512} unoptimized />
            : <Image className="mascot mascot-budget" src="/mascot/piggy-bank.webp" alt="" width={326} height={512} unoptimized />}
        </div>
        <div className="budget-actions">
          <label className="field">Month<input type="month" required min="0001-01" max="9999-12" value={month} onChange={(event) => {
            if (event.target.validity.valid) { setMonth(event.target.value); setDay(""); setCategory(""); setShowAllDays(false); }
          }} /></label>
          <button className="button primary" disabled={!ready || store.saving} onClick={() => setBudgetEditor({ previous: budgetRow })}><Pencil size={15} />{limit === undefined ? "Set budget plan" : "Edit budget plan"}</button>
        </div>
      </div>
      <div className="expense-metrics">{[
        { label: "Total money available", value: available === undefined ? "Not set" : money(available), caption: "Starting amount for this month" },
        { label: "Monthly budget", value: limit === undefined ? "Not set" : money(limit), caption: available !== undefined && limit !== undefined ? `${money(available - limit)} kept outside the budget` : "How much you plan to use" },
        { label: "Spent this month", value: money(spent), caption: `${monthly.length} ${monthly.length === 1 ? "expense" : "expenses"} recorded` },
        { label: remaining !== undefined && remaining < 0 ? "Over budget" : limit === undefined ? "Money left" : "Budget left", value: remaining === undefined ? "—" : money(Math.abs(remaining)), caption: limit === undefined ? "From your starting amount" : "After recorded expenses" },
      ].map((metric) => <div className="metric-card" key={metric.label}><p>{metric.label}</p><strong>{metric.value}</strong><small>{metric.caption}</small></div>)}</div>
      {budget !== undefined && <div className={remaining !== undefined && remaining < 0 ? "expense-over-budget" : ""}><progress aria-label={limit === undefined ? "Starting amount used" : "Monthly budget used"} value={Math.min(spent, budget || 1)} max={budget || 1} /><p className="muted">{budget > 0 ? `${Math.round(spent / budget * 100)}% used` : "Available to spend: RM 0.00"}{month === today.slice(0, 7) && ` · Spent today: ${money(total(monthly.filter((item) => item.date === today)))}`}</p></div>}
    </div>
    {limit !== undefined && <div className="card expense-breakdown">
      <div className="expense-ledger-heading"><h2>Category allocations</h2><span className="muted">Unallocated: {money(unallocated)}</span></div>
      {planned.length ? <div className="table-scroll budget-allocation-table"><table>
        <thead><tr><th>Category</th><th>Allocated</th><th>Spent</th><th>Left</th></tr></thead>
        <tbody>{planned.map((item) => <tr key={item.name}>
          <td><strong>{item.name}</strong>{item.cadence === "daily" && <div className="muted">{money(item.cents)} × {ledger.length} days</div>}</td>
          <td>{money(item.monthlyCents)}</td><td>{money(item.spent)}</td>
          <td className={item.spent > item.monthlyCents ? "expense-over-budget" : undefined}>{money(item.monthlyCents - item.spent)}</td>
        </tr>)}</tbody>
      </table></div> : <p className="muted">Edit your budget plan to split it into categories.</p>}
    </div>}
    <div className="card expense-ledger"><div className="expense-filters"><label className="field">Day (optional)<input type="date" value={day} min={`${month}-01`} max={ledger.at(-1)?.date} onChange={(event) => setDay(event.target.value)} /></label><label className="field">Category<select value={category} onChange={(event) => setCategory(event.target.value)}><option value="">All categories</option>{[...categoryNames].map(([key, name]) => <option key={key} value={key}>{name}</option>)}</select></label><label className="field">Search<input value={query} placeholder="Description or notes…" onChange={(event) => setQuery(event.target.value)} /></label><button className="button quiet" disabled={!visible.length} onClick={download}><Download size={15} /> Export CSV</button><button className="button quiet" onClick={() => { setDay(""); setCategory(""); setQuery(""); }}>Clear filters</button></div>
      {!ready ? <p className="empty">{store.error ? "Expenses unavailable" : "Loading expenses…"}</p> : !visible.length ? <div className="empty"><Image className="mascot mascot-empty" src="/mascot/receipt.webp" alt="" width={383} height={512} unoptimized /><h2>No expenses here yet</h2><p className="muted">Add an expense or adjust your filters to see your spending.</p></div> : days.map((date) => <div key={date} className="expense-day"><div className="expense-day-heading"><h3>{formatDate(date)}</h3><strong>{money(total(visible.filter((item) => item.date === date)))}</strong></div>{visible.filter((item) => item.date === date).map((item) => <div className="expense-row" key={item.id}><div className="expense-description"><strong>{item.title}</strong><p className="muted">{item.category}{item.notes ? ` · ${item.notes}` : ""}</p></div><strong>{money(item.cents)}</strong><button className="icon-button" aria-label={`Edit ${item.title}`} onClick={() => setEditor({ expense: item })}><Pencil size={15} /></button><button className="icon-button" aria-label={`Delete ${item.title}`} onClick={() => setDeleting(item)}><Trash2 size={15} /></button></div>)}</div>)}
    </div>
    {ready && <div className="card expense-breakdown"><div className="expense-ledger-heading"><div><h2>Day by day</h2><p className="muted">{displayedDays.length > 0 && `${formatDate(displayedDays[0].date, { day: "numeric", month: "short" })} – ${formatDate(displayedDays[displayedDays.length - 1].date, { day: "numeric", month: "short", year: "numeric" })}`} · {showAllDays ? "Full month" : "7-day view"}</p></div><button type="button" className="button quiet" aria-expanded={showAllDays} aria-controls="expense-daily-table" onClick={() => setShowAllDays((value) => !value)}>{showAllDays ? "Show fewer days" : `View all ${ledger.length} days`}</button></div><p className="muted expense-ledger-hint">Select a day to view its expenses. Balances include spending from the start of the month.</p><div className="table-scroll" id="expense-daily-table"><table><thead><tr><th>Day</th><th>Spent that day</th><th>Spent so far</th><th>{limit === undefined ? "Money left" : "Budget left"}</th></tr></thead><tbody>{displayedDays.map((entry) => <tr key={entry.date} className={entry.date === today ? "expense-today" : undefined}><td><button className="text-button" onClick={() => { setDay(entry.date); setCategory(""); setQuery(""); document.querySelector(".expense-ledger")?.scrollIntoView({ behavior: "smooth", block: "start" }); }}>{formatDate(entry.date, { day: "numeric", month: "short" })}{entry.date === today ? " · Today" : ""}</button></td><td>{money(entry.cents)}</td><td>{money(entry.spent)}</td><td className={entry.remaining !== undefined && entry.remaining < 0 ? "expense-over-budget" : ""}>{entry.remaining === undefined ? "—" : money(entry.remaining)}</td></tr>)}</tbody></table></div></div>}
    {budgetEditor && <ExpensePlanEditor
      month={month}
      monthLabel={monthLabel}
      previous={budgetEditor.previous}
      suggestions={[...categoryNames.values()]}
      saving={store.saving}
      onSave={async (plan) => { await store.saveBudget(month, plan, budgetEditor.previous); setBudgetEditor(null); }}
      onClose={() => setBudgetEditor(null)}
    />}
    {breakdown.length > 0 && <div className="card expense-breakdown"><h2>Monthly spending by category</h2>{breakdown.map((item) => <div key={item.name}><div className="expense-day-heading"><span>{item.name}</span><strong>{money(item.cents)}</strong></div><progress aria-label={`${item.name} spending`} value={item.cents} max={total(monthly)} /></div>)}</div>}
    {editor && <Modal title={editor.expense ? "Edit expense" : "New expense"} caption="Record spending in MYR." onClose={() => setEditor(null)}><form className="form-grid" onSubmit={save}><label className="field full">Description<input name="title" required maxLength={160} defaultValue={editor.expense?.title} /></label><label className="field">Amount (MYR)<input name="amount" type="number" min="0.01" max="999999999.99" step="0.01" required defaultValue={editor.expense ? (editor.expense.cents / 100).toFixed(2) : ""} /></label><label className="field">Date<input name="date" type="date" required defaultValue={editor.expense?.date ?? (month === today.slice(0, 7) ? today : `${month}-01`)} /></label><label className="field full">Category<select name="category" defaultValue={editor.expense?.category ?? defaultCategories[0]}>{expenseCategories.map((name) => <option key={name}>{name}</option>)}</select></label><label className="field full">Notes (optional)<textarea name="notes" maxLength={2000} defaultValue={editor.expense?.notes} /></label>{error && <p role="alert" className="form-error full">{error}</p>}<div className="modal-actions full"><button type="button" className="button quiet" onClick={() => setEditor(null)}>Cancel</button><button className="button primary" disabled={store.saving}>Save expense</button></div></form></Modal>}
    {deleting && <Modal title="Delete expense?" caption={`Remove “${deleting.title}” (${money(deleting.cents)})? This cannot be undone.`} onClose={() => setDeleting(null)}>{error && <p className="form-error" role="alert">{error}</p>}<div className="modal-actions"><button className="button quiet" onClick={() => setDeleting(null)}>Cancel</button><button className="button primary" disabled={store.saving} onClick={async () => { if (await persist(deleting, null)) setDeleting(null); }}>Delete expense</button></div></Modal>}
  </section>;
}
