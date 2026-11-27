"use client";

import { useState, type FormEvent } from "react";
import Image from "next/image";
import { CalendarPlus, Plus, Trash2, Wallet } from "lucide-react";
import { formatDate, money } from "@/lib/projects";
import { addIncome, evaluate, maxCents, maxItems, moneySummary, plainAmount, planItemTotal, startMonth, sum, toCents, type MoneyAccount, type MoneySheet, type PlanItem } from "@/lib/money";
import { useMoneySheet } from "@/lib/use-money";
import { Modal } from "./ui";

const monthLabel = (month: string) => formatDate(`${month}-01`, { month: "long", year: "numeric" });
const parseCents = (text: string, allowNegative = false) => {
  const value = evaluate(text);
  if (value === undefined) return undefined;
  const cents = toCents(value);
  return Number.isSafeInteger(cents) && Math.abs(cents) <= maxCents && (allowNegative || cents >= 0) ? cents : undefined;
};
const hasMath = (text: string) => /[+\-*/x×÷()]/i.test(text.trim().replace(/^-/, ""));
/** "200 + 1 + 558" — the same sum you'd write in a notepad. */
const sumLine = (values: number[]) => values.length ? values.map(plainAmount).join(" + ") : "0";
/** "759 − 627", or "759 + 1241" while emergency money is below zero. */
const minusLine = (total: number, emergency: number) => `${plainAmount(total)} ${emergency < 0 ? "+" : "−"} ${plainAmount(Math.abs(emergency))}`;

/** Amount field that accepts notepad math such as 30*3 or 558-12. */
function AmountInput({ cents, label, allowNegative = false, onChange }: { cents: number; label: string; allowNegative?: boolean; onChange: (cents: number) => void }) {
  const [text, setText] = useState(plainAmount(cents));
  const [shown, setShown] = useState(cents);
  const [focused, setFocused] = useState(false);
  if (!focused && shown !== cents) { setShown(cents); setText(plainAmount(cents)); }
  const parsed = parseCents(text, allowNegative);
  return <span className="money-input">
    <span aria-hidden="true">RM</span>
    <input aria-label={label} inputMode="decimal" autoComplete="off" value={text} aria-invalid={parsed === undefined}
      onFocus={() => setFocused(true)}
      onChange={(event) => {
        setText(event.target.value);
        const next = parseCents(event.target.value, allowNegative);
        if (next !== undefined && next !== shown) { setShown(next); onChange(next); }
      }}
      onBlur={() => { setFocused(false); setText(plainAmount(shown)); }}
      onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} />
    {focused && hasMath(text) && <small className={parsed === undefined ? "money-input-hint invalid" : "money-input-hint"}>{parsed === undefined ? "Finish the sum" : `= ${money(parsed)}`}</small>}
  </span>;
}

export function Expenses({ owner, today }: { owner: string; today: string }) {
  const month = today.slice(0, 7);
  const store = useMoneySheet(owner, month);
  const { sheet, ready } = store;
  const [dialog, setDialog] = useState<"month" | "income" | null>(null);
  const [removing, setRemoving] = useState<MoneyAccount | null>(null);
  const summary = moneySummary(sheet, today);
  const newMonthDue = ready && store.started && sheet.month < month;
  const tooMany = (items: unknown[]) => items.length >= maxItems;

  const setAccount = (id: string, change: Partial<MoneyAccount>) => store.save({ ...sheet, accounts: sheet.accounts.map((item) => item.id === id ? { ...item, ...change } : item) });
  const setPlanItem = (id: string, change: Partial<PlanItem>) => store.save({ ...sheet, plan: sheet.plan.map((item) => item.id === id ? { ...item, ...change } : item) });
  const removeAccount = (id: string) => store.save({ ...sheet, accounts: sheet.accounts.filter((item) => item.id !== id) });

  const status = store.cloud
    ? store.error ? "Cloud sync unavailable" : !ready ? "Connecting to Supabase…" : store.saving || store.unsaved ? "Saving…" : store.live ? "Saved in Supabase · Live sync across devices" : "Saved in Supabase · Checking for updates"
    : store.saving || store.unsaved ? "Saving…" : "Demo · Saved in this browser";
  const over = summary.left < 0;
  const planState = summary.unplanned === 0 ? { text: "Matches what’s left", tone: "good" }
    : summary.unplanned > 0 ? { text: `${money(summary.unplanned)} not planned yet`, tone: "" }
    : { text: `${money(-summary.unplanned)} more than what’s left`, tone: "bad" };

  return <section className="expenses-page" aria-label="Expenses">
    <div className="card todo-toolbar">
      <div className="todo-summary"><span className="metric-icon lavender"><Wallet size={19} /></span><div><strong>Your money, notepad style</strong><p className="muted" aria-live="polite">{status}</p></div></div>
      <div className="money-toolbar-actions">
        <button className="button quiet" disabled={!ready || !sheet.accounts.length} onClick={() => setDialog("income")}><Plus size={16} /> Add income</button>
        <button className="button primary" disabled={!ready || !sheet.accounts.length} onClick={() => setDialog("month")}><CalendarPlus size={16} /> Start a month</button>
      </div>
    </div>
    {store.error && <div className="error-banner" role="alert">{store.error}<button className="button quiet" onClick={store.retry}>Retry</button></div>}
    {store.saveError && <div className="error-banner" role="alert">{store.saveError}<button className="button quiet" onClick={store.retry}>Retry</button></div>}
    {newMonthDue && <div className="card money-callout" role="status">
      <div><strong>It’s {monthLabel(month)}</strong><p className="muted">Start the month to move what’s left from {monthLabel(sheet.month)} into emergency money and reset your {money(sheet.budget_cents)} budget.</p></div>
      <button className="button primary" onClick={() => setDialog("month")}><CalendarPlus size={16} /> Start {formatDate(`${month}-01`, { month: "long" })}</button>
    </div>}
    {ready && !store.started && <div className="card money-callout" role="status">
      <div><strong>Set up your sheet</strong><p className="muted">Type in your balances and emergency money below. Or enter your balances, then use <b>Start a month</b> to keep {money(sheet.budget_cents)} to spend and put the rest in emergency money.</p></div>
    </div>}

    <div className={over ? "card money-hero over" : "card money-hero"}>
      <div className="money-hero-main">
        <p className="eyebrow">LEFT TO SPEND · {monthLabel(sheet.month).toUpperCase()}</p>
        <strong className="money-hero-value">{ready ? money(summary.left) : "—"}</strong>
        {ready && store.started && <>
          <p className="notepad-line">{minusLine(summary.total, sheet.emergency_cents)} = {plainAmount(summary.left)}</p>
          <progress aria-label="Monthly budget used" value={Math.min(Math.max(summary.spent, 0), sheet.budget_cents || 1)} max={sheet.budget_cents || 1} />
          <p className="muted">{over
            ? `${money(-summary.left)} over · you’re using emergency money`
            : summary.left > sheet.budget_cents
              ? `More than your ${money(sheet.budget_cents)} budget`
              : `${money(summary.spent)} spent of ${money(sheet.budget_cents)}`} · {summary.days} {summary.days === 1 ? "day" : "days"} left in {formatDate(`${month}-01`, { month: "long" })}</p>
        </>}
      </div>
      <Image className="mascot money-hero-mascot" src={over ? "/mascot/worried.webp" : "/mascot/piggy-bank.webp"} alt="" width={over ? 331 : 326} height={512} unoptimized />
    </div>

    {!ready ? <div className="card empty">{store.error ? "Your money sheet is unavailable." : "Loading your money sheet…"}</div> : <div className="money-columns">
      <div className="card money-card">
        <div className="money-card-heading"><h2>Money</h2><span className="muted">What you have right now</span></div>
        <ul className="money-rows">
          {sheet.accounts.map((item) => <li className="money-row" key={item.id}>
            <input className="money-name" aria-label="Account name" placeholder="Account" maxLength={100} value={item.name} onChange={(event) => setAccount(item.id, { name: event.target.value })} />
            <AmountInput label={`${item.name || "Account"} balance`} cents={item.cents} onChange={(cents) => setAccount(item.id, { cents })} />
            <button className="icon-button" aria-label={`Remove ${item.name || "account"}`} onClick={() => item.cents ? setRemoving(item) : removeAccount(item.id)}><Trash2 size={15} /></button>
          </li>)}
        </ul>
        <button className="button quiet money-add" disabled={!ready || tooMany(sheet.accounts)} onClick={() => store.save({ ...sheet, accounts: [...sheet.accounts, { id: crypto.randomUUID(), name: "", cents: 0 }] })}><Plus size={15} /> Add account</button>
        <div className="money-total"><span className="notepad-line">{sumLine(sheet.accounts.map((item) => item.cents))} =</span><strong>{money(summary.total)}</strong></div>
        <div className="money-row money-emergency">
          <div><strong>Emergency money</strong><p className="muted">Kept aside. Leftovers and income above your budget go here.</p></div>
          <AmountInput label="Emergency money" allowNegative cents={sheet.emergency_cents} onChange={(cents) => store.save({ ...sheet, emergency_cents: cents })} />
        </div>
        {sheet.emergency_cents < 0 && <p className="muted money-note">Below zero until your income arrives. Use <b>Add income</b> when it does.</p>}
        <div className="money-total money-left"><span className="notepad-line">{minusLine(summary.total, sheet.emergency_cents)} =</span><strong className={over ? "money-bad" : undefined}>{money(summary.left)}</strong></div>
      </div>

      <div className="card money-card">
        <div className="money-card-heading"><h2>Plan</h2><span className="muted">How you’ll use the {money(Math.max(summary.left, 0))} left · {summary.days} {summary.days === 1 ? "day" : "days"} to go</span></div>
        <ul className="money-rows">
          {sheet.plan.map((item) => <li className="money-row plan-row" key={item.id}>
            <input className="money-name" aria-label="Plan item name" placeholder="Item" maxLength={100} value={item.name} onChange={(event) => setPlanItem(item.id, { name: event.target.value })} />
            <AmountInput label={`${item.name || "Item"} amount${item.daily ? " per day" : ""}`} cents={item.cents} onChange={(cents) => setPlanItem(item.id, { cents })} />
            <label className="per-day"><input type="checkbox" checked={item.daily} onChange={(event) => setPlanItem(item.id, { daily: event.target.checked })} /> per day</label>
            <button className="icon-button" aria-label={`Remove ${item.name || "item"}`} onClick={() => store.save({ ...sheet, plan: sheet.plan.filter((entry) => entry.id !== item.id) })}><Trash2 size={15} /></button>
            {item.daily && <p className="plan-calc"><span className="notepad-line">{plainAmount(item.cents)} × {summary.days} {summary.days === 1 ? "day" : "days"} left =</span> {money(planItemTotal(item, summary.days))}</p>}
          </li>)}
        </ul>
        <button className="button quiet money-add" disabled={!ready || tooMany(sheet.plan)} onClick={() => store.save({ ...sheet, plan: [...sheet.plan, { id: crypto.randomUUID(), name: "", cents: 0, daily: false }] })}><Plus size={15} /> Add item</button>
        <div className="money-total"><span className="notepad-line">{sumLine(sheet.plan.map((item) => planItemTotal(item, summary.days)))} =</span><strong>{money(summary.planned)}</strong></div>
        <p className={`plan-status ${planState.tone}`}>{planState.text}</p>
      </div>
    </div>}

    {dialog === "month" && <StartMonthDialog sheet={sheet} month={month} left={summary.left} saving={store.saving} onClose={() => setDialog(null)} onSave={async (next) => { await store.saveNow(next); setDialog(null); }} />}
    {dialog === "income" && <IncomeDialog sheet={sheet} left={summary.left} onClose={() => setDialog(null)} onSave={async (next) => { await store.saveNow(next); setDialog(null); }} />}
    {removing && <Modal title={`Remove ${removing.name || "this account"}?`} caption={`Its ${money(removing.cents)} balance will no longer count towards your money.`} onClose={() => setRemoving(null)}>
      <div className="modal-actions"><button className="button quiet" onClick={() => setRemoving(null)}>Cancel</button><button className="button primary" onClick={() => { removeAccount(removing.id); setRemoving(null); }}>Remove account</button></div>
    </Modal>}
  </section>;
}

function defaultAccount(accounts: MoneyAccount[]) {
  return accounts.reduce<MoneyAccount | undefined>((best, item) => !best || item.cents > best.cents ? item : best, undefined)?.id ?? "";
}

function AccountSelect({ accounts, value, onChange }: { accounts: MoneyAccount[]; value: string; onChange: (id: string) => void }) {
  return <label className="field">Into account<select value={value} onChange={(event) => onChange(event.target.value)}>{accounts.map((item) => <option key={item.id} value={item.id}>{item.name || "Unnamed account"}</option>)}</select></label>;
}

function StartMonthDialog({ sheet, month, left, saving, onClose, onSave }: { sheet: MoneySheet; month: string; left: number; saving: boolean; onClose: () => void; onSave: (next: MoneySheet) => Promise<void> }) {
  const [budget, setBudget] = useState(plainAmount(sheet.budget_cents));
  const [income, setIncome] = useState("");
  const [account, setAccount] = useState(() => defaultAccount(sheet.accounts));
  const budgetCents = parseCents(budget);
  const incomeCents = income.trim() ? parseCents(income) : 0;
  const valid = budgetCents !== undefined && incomeCents !== undefined;
  const next = valid ? startMonth(sheet, month, budgetCents, incomeCents, account) : undefined;
  const sameMonth = sheet.month === month;
  const extra = valid ? incomeCents - budgetCents : 0;
  const tooBig = next !== undefined && Math.abs(next.emergency_cents) > maxCents;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (next && !tooBig) await onSave(next);
  }

  return <Modal title={`Start ${monthLabel(month)}`} caption={sameMonth ? `This resets what’s left to your budget and moves the current ${money(left)} into emergency money.` : undefined} onClose={onClose}>
    <form className="form-grid" onSubmit={submit}>
      <label className="field">Monthly budget (MYR)<input inputMode="decimal" required value={budget} aria-invalid={budgetCents === undefined} onChange={(event) => setBudget(event.target.value)} /></label>
      <label className="field">Income received (MYR)<input inputMode="decimal" placeholder="Not yet" value={income} aria-invalid={incomeCents === undefined} onChange={(event) => setIncome(event.target.value)} /></label>
      {Boolean(incomeCents) && <AccountSelect accounts={sheet.accounts} value={account} onChange={setAccount} />}
      {next && <div className="notepad full" aria-live="polite">
        <p><span>{sameMonth ? "Left right now" : `Left from ${formatDate(`${sheet.month}-01`, { month: "long" })}`}</span><span>{money(left)} → emergency</span></p>
        <p><span>{incomeCents ? `Income ${plainAmount(incomeCents)} − budget ${plainAmount(next.budget_cents)}` : `Budget not covered by income yet`}</span><span>{extra < 0 ? "−" : "+"}{money(Math.abs(extra))} {extra < 0 ? "from emergency" : "→ emergency"}</span></p>
        <hr />
        <p><span>Emergency money</span><span>{plainAmount(sheet.emergency_cents)} {left < 0 ? "−" : "+"} {plainAmount(Math.abs(left))} {extra < 0 ? "−" : "+"} {plainAmount(Math.abs(extra))} = <b>{money(next.emergency_cents)}</b></span></p>
        <p><span>Left to spend</span><b>{money(sum(next.accounts) - next.emergency_cents)}</b></p>
      </div>}
      {!incomeCents && valid && <p className="muted full">If your income comes in late, start the month anyway and use <b>Add income</b> when it arrives.</p>}
      {tooBig && <p className="form-error full" role="alert">That amount is too large.</p>}
      <div className="modal-actions full"><button type="button" className="button quiet" onClick={onClose}>Cancel</button><button className="button primary" disabled={!next || tooBig || saving}>Start {formatDate(`${month}-01`, { month: "long" })}</button></div>
    </form>
  </Modal>;
}

function IncomeDialog({ sheet, left, onClose, onSave }: { sheet: MoneySheet; left: number; onClose: () => void; onSave: (next: MoneySheet) => Promise<void> }) {
  const [income, setIncome] = useState("");
  const [account, setAccount] = useState(() => defaultAccount(sheet.accounts));
  const cents = parseCents(income);
  const next = cents ? addIncome(sheet, cents, account) : undefined;
  const tooBig = next !== undefined && (Math.abs(next.emergency_cents) > maxCents || next.accounts.some((item) => item.cents > maxCents));

  return <Modal title="Add income" caption="This month’s budget is already counted, so new income goes to emergency money." onClose={onClose}>
    <form className="form-grid" onSubmit={async (event) => { event.preventDefault(); if (next && !tooBig) await onSave(next); }}>
      <label className="field">Amount (MYR)<input inputMode="decimal" required value={income} aria-invalid={income.trim() !== "" && !cents} onChange={(event) => setIncome(event.target.value)} /></label>
      <AccountSelect accounts={sheet.accounts} value={account} onChange={setAccount} />
      {next && <div className="notepad full" aria-live="polite">
        <p><span>Emergency money</span><span>{plainAmount(sheet.emergency_cents)} + {plainAmount(cents!)} = <b>{money(next.emergency_cents)}</b></span></p>
        <p><span>Left to spend</span><span>stays <b>{money(left)}</b></span></p>
      </div>}
      {tooBig && <p className="form-error full" role="alert">That amount is too large.</p>}
      <div className="modal-actions full"><button type="button" className="button quiet" onClick={onClose}>Cancel</button><button className="button primary" disabled={!next || tooBig}>Add income</button></div>
    </form>
  </Modal>;
}
