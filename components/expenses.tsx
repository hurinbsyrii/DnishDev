"use client";

import { useState, type FormEvent } from "react";
import Image from "next/image";
import { Download, Pencil, Plus, Trash2, Wallet } from "lucide-react";
import { formatDate } from "@/lib/projects";
import { monthLedger, recentLedgerDays } from "@/lib/expense-budget";
import { useExpenses } from "@/lib/use-expenses";
import type { Expense } from "@/lib/expenses";
import { Modal } from "./ui";

const categories = ["Food & drinks", "Transport", "Shopping", "Bills & utilities", "Subscriptions", "Health", "Business", "Other"];
const money = (cents: number) => new Intl.NumberFormat("en-MY", { style: "currency", currency: "MYR" }).format(cents / 100);
const total = (items: Expense[]) => items.reduce((sum, item) => sum + item.cents, 0);

export function Expenses({ owner, today }: { owner: string; today: string }) {
  const store = useExpenses(owner);
  const { expenses, ready } = store;
  const budgetReady = ready;
  const [error, setError] = useState("");
  const [budgetError, setBudgetError] = useState("");
  const [budgetEditor, setBudgetEditor] = useState<{ previous: typeof store.budgets[number] | undefined } | null>(null);
  const [month, setMonth] = useState(today.slice(0, 7));
  const [showAllDays, setShowAllDays] = useState(false);
  const [day, setDay] = useState("");
  const [category, setCategory] = useState("");
  const [query, setQuery] = useState("");
  const [editor, setEditor] = useState<{ expense: Expense | null } | null>(null);
  const [deleting, setDeleting] = useState<Expense | null>(null);

  async function saveBudget(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!budgetEditor) return;
    const cents = Math.round(Number(new FormData(event.currentTarget).get("budget")) * 100);
    if (!Number.isSafeInteger(cents) || cents < 0) { setBudgetError("Enter a valid starting amount."); return; }
    try { await store.saveBudget(month, cents, budgetEditor.previous); setBudgetError(""); setBudgetEditor(null); }
    catch (reason) { setBudgetError(reason instanceof Error ? reason.message : "Couldn’t save your starting amount."); }
  }

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
  const budget = budgetRow?.amount_cents;
  const spent = total(monthly);
  const remaining = budget === undefined ? undefined : budget - spent;
  const ledger = monthLedger(month, monthly, budget);
  const displayedDays = showAllDays ? ledger : recentLedgerDays(ledger, today);
  const monthLabel = formatDate(`${month}-01`, { month: "long", year: "numeric" });
  const visible = monthly.filter((item) => (!day || item.date === day) && (!category || item.category === category) && `${item.title} ${item.notes}`.toLowerCase().includes(query.trim().toLowerCase())).sort((a, b) => b.date.localeCompare(a.date) || a.title.localeCompare(b.title));
  const days = [...new Set(visible.map((item) => item.date))];
  const breakdown = categories.map((name) => ({ name, cents: total(monthly.filter((item) => item.category === name)) })).filter((item) => item.cents > 0).sort((a, b) => b.cents - a.cents);
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
    {budgetError && <p className="error-banner" role="alert">{budgetError}</p>}
    <div className="card expense-budget">
      <div className="expense-day-heading"><div><p className="eyebrow">MONTHLY MONEY PLAN</p><h2>{monthLabel}</h2><p className="muted">Set the money you have for this month, then record what you spend each day.</p></div><div className="budget-actions">{remaining !== undefined && remaining < 0
        ? <Image key="worried" className="mascot mascot-budget" src="/mascot/worried.webp" alt="" width={331} height={512} unoptimized />
        : <Image key="piggy" className="mascot mascot-budget" src="/mascot/piggy-bank.webp" alt="" width={326} height={512} unoptimized />}<button className="button primary" disabled={!budgetReady || store.saving} onClick={() => { setBudgetError(""); setBudgetEditor({ previous: budgetRow }); }}><Pencil size={15} />{budget === undefined ? "Set starting amount" : "Edit starting amount"}</button></div></div>
      <div className="expense-metrics">{[{ label: "Starting amount", value: budget === undefined ? "Not set" : money(budget), caption: "Your money for this month" }, { label: "Spent this month", value: money(spent), caption: `${monthly.length} expenses recorded` }, { label: remaining !== undefined && remaining < 0 ? "Over budget" : "Money left", value: remaining === undefined ? "Set your amount" : money(Math.abs(remaining)), caption: remaining !== undefined && remaining < 0 ? "Spending exceeds your starting amount" : "Starting amount minus all monthly expenses" }].map((metric) => <div className="metric-card" key={metric.label}><p>{metric.label}</p><strong>{metric.value}</strong><small>{metric.caption}</small></div>)}</div>
      {budget !== undefined && <div className={remaining !== undefined && remaining < 0 ? "expense-over-budget" : ""}><progress aria-label="Monthly budget used" value={Math.min(spent, budget || 1)} max={budget || 1} /><p className="muted">{budget > 0 ? `${Math.round(spent / budget * 100)}% of your starting amount spent` : "Starting amount is RM 0.00"} · Spent today: {money(total(expenses.filter((item) => item.date === today)))}</p></div>}
    </div>
    <div className="card expense-ledger"><div className="expense-filters"><label className="field">Month<input type="month" required value={month} onChange={(event) => { if (event.target.value) { setMonth(event.target.value); setDay(""); setShowAllDays(false); } }} /></label><label className="field">Day (optional)<input type="date" value={day} min={`${month}-01`} max={`${month}-${new Date(Number(month.slice(0, 4)), Number(month.slice(5)), 0).getDate()}`} onChange={(event) => setDay(event.target.value)} /></label><label className="field">Category<select value={category} onChange={(event) => setCategory(event.target.value)}><option value="">All categories</option>{categories.map((name) => <option key={name}>{name}</option>)}</select></label><label className="field">Search<input value={query} placeholder="Description or notes…" onChange={(event) => setQuery(event.target.value)} /></label><button className="button quiet" disabled={!visible.length} onClick={download}><Download size={15} /> Export CSV</button><button className="button quiet" onClick={() => { setDay(""); setCategory(""); setQuery(""); }}>Clear filters</button></div>
      {!ready ? <p className="empty">{store.error ? "Expenses unavailable" : "Loading expenses…"}</p> : !visible.length ? <div className="empty"><Image className="mascot mascot-empty" src="/mascot/receipt.webp" alt="" width={383} height={512} unoptimized /><h2>No expenses here yet</h2><p className="muted">Add an expense or adjust your filters to see your spending.</p></div> : days.map((date) => <div key={date} className="expense-day"><div className="expense-day-heading"><h3>{formatDate(date)}</h3><strong>{money(total(visible.filter((item) => item.date === date)))}</strong></div>{visible.filter((item) => item.date === date).map((item) => <div className="expense-row" key={item.id}><div className="expense-description"><strong>{item.title}</strong><p className="muted">{item.category}{item.notes ? ` · ${item.notes}` : ""}</p></div><strong>{money(item.cents)}</strong><button className="icon-button" aria-label={`Edit ${item.title}`} onClick={() => setEditor({ expense: item })}><Pencil size={15} /></button><button className="icon-button" aria-label={`Delete ${item.title}`} onClick={() => setDeleting(item)}><Trash2 size={15} /></button></div>)}</div>)}
    </div>
    {ready && <div className="card expense-breakdown"><div className="expense-ledger-heading"><div><h2>Day by day</h2><p className="muted">{displayedDays.length > 0 && `${formatDate(displayedDays[0].date, { day: "numeric", month: "short" })} – ${formatDate(displayedDays[displayedDays.length - 1].date, { day: "numeric", month: "short", year: "numeric" })}`} · {showAllDays ? "Full month" : "7-day view"}</p></div><button type="button" className="button quiet" aria-expanded={showAllDays} aria-controls="expense-daily-table" onClick={() => setShowAllDays((value) => !value)}>{showAllDays ? "Show fewer days" : `View all ${ledger.length} days`}</button></div><p className="muted expense-ledger-hint">Select a day to view its expenses. Money left includes spending from the start of the month.</p><div className="table-scroll" id="expense-daily-table"><table><thead><tr><th>Day</th><th>Spent that day</th><th>Spent so far</th><th>Money left</th></tr></thead><tbody>{displayedDays.map((entry) => <tr key={entry.date} className={entry.date === today ? "expense-today" : undefined}><td><button className="text-button" onClick={() => { setDay(entry.date); setCategory(""); setQuery(""); document.querySelector(".expense-ledger")?.scrollIntoView({ behavior: "smooth", block: "start" }); }}>{formatDate(entry.date, { day: "numeric", month: "short" })}{entry.date === today ? " · Today" : ""}</button></td><td>{money(entry.cents)}</td><td>{money(entry.spent)}</td><td className={entry.remaining !== undefined && entry.remaining < 0 ? "expense-over-budget" : ""}>{entry.remaining === undefined ? "—" : money(entry.remaining)}</td></tr>)}</tbody></table></div></div>}
    {budgetEditor && <Modal title={`Starting amount · ${monthLabel}`} caption="Enter the total money available for this month in MYR. Each month has its own amount; unused money does not carry over automatically." onClose={() => setBudgetEditor(null)}><form className="form-grid" onSubmit={saveBudget}><label className="field full">Starting amount (MYR)<input name="budget" type="number" min="0" max="999999999.99" step="0.01" required defaultValue={budgetEditor.previous === undefined ? "" : (budgetEditor.previous.amount_cents / 100).toFixed(2)} placeholder="e.g. 1000.00" /></label>{budgetError && <p className="form-error full" role="alert">{budgetError}</p>}<div className="modal-actions full"><button type="button" className="button quiet" onClick={() => setBudgetEditor(null)}>Cancel</button><button className="button primary" disabled={store.saving}>Save starting amount</button></div></form></Modal>}
    {breakdown.length > 0 && <div className="card expense-breakdown"><h2>Monthly spending by category</h2>{breakdown.map((item) => <div key={item.name}><div className="expense-day-heading"><span>{item.name}</span><strong>{money(item.cents)}</strong></div><progress aria-label={`${item.name} spending`} value={item.cents} max={total(monthly)} /></div>)}</div>}
    {editor && <Modal title={editor.expense ? "Edit expense" : "New expense"} caption="Record spending in MYR." onClose={() => setEditor(null)}><form className="form-grid" onSubmit={save}><label className="field full">Description<input name="title" required maxLength={160} defaultValue={editor.expense?.title} /></label><label className="field">Amount (MYR)<input name="amount" type="number" min="0.01" max="999999999.99" step="0.01" required defaultValue={editor.expense ? (editor.expense.cents / 100).toFixed(2) : ""} /></label><label className="field">Date<input name="date" type="date" required defaultValue={editor.expense?.date ?? today} /></label><label className="field full">Category<select name="category" defaultValue={editor.expense?.category ?? categories[0]}>{categories.map((name) => <option key={name}>{name}</option>)}</select></label><label className="field full">Notes (optional)<textarea name="notes" maxLength={2000} defaultValue={editor.expense?.notes} /></label>{error && <p role="alert" className="form-error full">{error}</p>}<div className="modal-actions full"><button type="button" className="button quiet" onClick={() => setEditor(null)}>Cancel</button><button className="button primary" disabled={store.saving}>Save expense</button></div></form></Modal>}
    {deleting && <Modal title="Delete expense?" caption={`Remove “${deleting.title}” (${money(deleting.cents)})? This cannot be undone.`} onClose={() => setDeleting(null)}>{error && <p className="form-error" role="alert">{error}</p>}<div className="modal-actions"><button className="button quiet" onClick={() => setDeleting(null)}>Cancel</button><button className="button primary" disabled={store.saving} onClick={async () => { if (await persist(deleting, null)) setDeleting(null); }}>Delete expense</button></div></Modal>}
  </section>;
}
