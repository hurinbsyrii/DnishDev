import { useId, useState, type FormEvent } from "react";
import { Plus, Trash2 } from "lucide-react";
import { allocationTotal, budgetPlanError, categoryKey, daysInMonth, maxBudgetCategories, type BudgetAllocation, type BudgetPlan } from "@/lib/expense-budget";
import { money } from "@/lib/projects";
import { Modal } from "./ui";

const examples = ["Food & drinks", "Fuel", "Fun", "Savings"];
const inputAmount = (cents: number | null | undefined) => cents == null ? "" : (cents / 100).toFixed(2);
const parseAmount = (value: string) => value.trim() ? Math.round(Number(value) * 100) : NaN;
const amountInput = { type: "number", min: 0, max: 999999999.99, step: "0.01", required: true } as const;
type DraftAllocation = { id: string; name: string; cadence: BudgetAllocation["cadence"]; amount: string };

export function ExpensePlanEditor({ month, monthLabel, previous, suggestions, saving, onSave, onClose }: {
  month: string;
  monthLabel: string;
  previous?: BudgetPlan;
  suggestions: string[];
  saving: boolean;
  onSave: (plan: BudgetPlan) => Promise<void>;
  onClose: () => void;
}) {
  const suggestionsId = useId();
  const [available, setAvailable] = useState(inputAmount(previous?.amount_cents));
  const [limit, setLimit] = useState(inputAmount(previous?.spending_limit_cents));
  const [error, setError] = useState("");
  const [drafts, setDrafts] = useState<DraftAllocation[]>(() => (previous?.allocations ?? []).map((item, index) => ({
    id: String(index), name: item.name, cadence: item.cadence, amount: inputAmount(item.cents),
  })));
  const allocations = drafts.map(({ name, cadence, amount }) => ({ name: name.trim(), cadence, cents: parseAmount(amount) }));
  const days = daysInMonth(month);
  const allocated = allocations.reduce((sum, item) => sum + (Number.isFinite(item.cents) ? allocationTotal(item, days) : 0), 0);
  const budgetLeft = parseAmount(limit) - allocated;

  function update(id: string, change: Partial<DraftAllocation>) {
    setDrafts((current) => current.map((item) => item.id === id ? { ...item, ...change } : item));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const plan = { amount_cents: parseAmount(available), spending_limit_cents: parseAmount(limit), allocations };
    const validation = budgetPlanError(month, plan);
    if (validation) { setError(validation); return; }
    setError("");
    try { await onSave(plan); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Couldn’t save your monthly budget."); }
  }

  return <Modal title={`Budget plan · ${monthLabel}`} onClose={onClose}>
    <form className="form-grid" onSubmit={submit}>
      <label className="field">Total money available (MYR)<input {...amountInput} value={available} onChange={(event) => setAvailable(event.target.value)} /></label>
      <label className="field">Monthly budget (MYR)<input {...amountInput} value={limit} onChange={(event) => setLimit(event.target.value)} /></label>
      <div className="budget-editor-categories full">
        <div className="expense-day-heading"><h3>Category allocations</h3><button type="button" className="button quiet" disabled={drafts.length >= maxBudgetCategories} onClick={() => setDrafts([...drafts, { id: crypto.randomUUID(), name: "", cadence: "monthly", amount: "" }])}><Plus size={15} /> Add category</button></div>
        <datalist id={suggestionsId}>{[...new Set([...examples, ...suggestions])].map((name) => <option key={name} value={name} />)}</datalist>
        {drafts.map((item, index) => {
          const amount = allocations[index].cents;
          return <fieldset className="budget-editor-category" key={item.id}>
            <legend>Category {index + 1}</legend>
            <label className="field">Name<input list={suggestionsId} maxLength={100} required value={item.name} onChange={(event) => {
              const name = event.target.value;
              const isFood = ["food", "food & drinks", "makanan"].includes(categoryKey(name));
              update(item.id, isFood ? { name, cadence: "daily" } : { name });
            }} /></label>
            <label className="field">Frequency<select value={item.cadence} onChange={(event) => update(item.id, { cadence: event.target.value === "daily" ? "daily" : "monthly" })}><option value="monthly">Per month</option><option value="daily">Per day</option></select></label>
            <label className="field">Amount (MYR)<input {...amountInput} value={item.amount} onChange={(event) => update(item.id, { amount: event.target.value })} /></label>
            <button className="icon-button" type="button" aria-label={`Remove ${item.name || `category ${index + 1}`}`} onClick={() => setDrafts(drafts.filter((draft) => draft.id !== item.id))}><Trash2 size={16} /></button>
            {item.cadence === "daily" && <p className="muted budget-daily-calculation">{Number.isFinite(amount) ? `${money(amount)} × ${days} days = ${money(allocationTotal(allocations[index], days))}` : `Daily amount × ${days} days`}</p>}
          </fieldset>;
        })}
        {Number.isFinite(budgetLeft) && <p className={budgetLeft < 0 ? "expense-over-budget" : "muted"}>{budgetLeft < 0 ? "Over-allocated" : "Unallocated"}: {money(Math.abs(budgetLeft))}</p>}
      </div>
      {error && <p className="form-error full" role="alert">{error}</p>}
      <div className="modal-actions full"><button type="button" className="button quiet" onClick={onClose}>Cancel</button><button className="button primary" disabled={saving}>Save budget plan</button></div>
    </form>
  </Modal>;
}
