"use client";

import { useEffect, useRef, useState } from "react";
import { cloudConfigured, getSupabase } from "./supabase";
import { expenseFromRow, expenseRow, parseExpenses, type Expense, type ExpenseRow } from "./expenses";
import { readBudgets } from "./expense-budget";

type BudgetRow = { month: string; amount_cents: number; version: number };
export function useExpenses(owner: string) {
  const [snapshot, setSnapshot] = useState<{ expenses: Expense[]; budgets: BudgetRow[] } | null>(null);
  const [error, setError] = useState("");
  const [importWarning, setImportWarning] = useState("");
  const [saving, setSaving] = useState(false);
  const [live, setLive] = useState(false);
  const [reload, setReload] = useState(0);
  const syncRef = useRef<(() => Promise<void>) | null>(null);
  const writing = useRef(false);
  const generation = useRef(0);
  const storageKey = `devdash:expenses:${owner}`;
  const budgetKey = `devdash:expense-budgets:${owner}`;

  useEffect(() => {
    let active = true;
    let request = 0;
    const client = getSupabase();
    async function rows(table: string) {
      const result = [];
      for (let offset = 0; ; offset += 500) {
        const { data, error } = await client!.from(table).select("*").eq("user_id", owner).order(table === "expenses" ? "id" : "month").range(offset, offset + 499);
        if (error) throw error;
        result.push(...data);
        if (data.length < 500) return result;
      }
    }
    async function sync() {
      const current = ++request;
      const started = generation.current;
      try {
        let next;
        if (client) {
          const [expenses, budgets] = await Promise.all([rows("expenses"), rows("expense_budgets")]);
          next = { expenses: (expenses as ExpenseRow[]).map(expenseFromRow), budgets: (budgets as BudgetRow[]).map((row) => ({ ...row, amount_cents: Number(row.amount_cents) })) };
        } else next = { expenses: parseExpenses(localStorage.getItem(storageKey)), budgets: Object.entries(readBudgets(localStorage.getItem(budgetKey))).map(([month, amount_cents]) => ({ month, amount_cents, version: 1 })) };
        if (active && current === request && started === generation.current) { setSnapshot(next); setError(""); }
      } catch { if (active && current === request) setError(client ? "Couldn’t sync expenses. Check your connection and apply the synced expenses Supabase migration, then retry." : "Couldn’t load demo expenses. Check browser storage and retry."); }
    }
    async function initialize() {
      if (client) {
        try {
          const expenses = parseExpenses(localStorage.getItem(storageKey));
          const budgets = readBudgets(localStorage.getItem(budgetKey));
          if (expenses.length || Object.keys(budgets).length) {
            const { error } = await client.rpc("import_browser_expenses", { p_expenses: expenses.map(expenseRow), p_budgets: Object.entries(budgets).map(([month, amount_cents]) => ({ month, amount_cents })) });
            if (error) throw error;
          }
          if (active) setImportWarning("");
        } catch { if (active) setImportWarning("Your old browser expenses and budgets are kept safely on this device, but couldn’t be imported. Apply the synced expenses migration, then retry here."); }
      }
      if (active) await sync();
    }
    syncRef.current = sync;
    const timer = setTimeout(() => void initialize(), 0);
    const channel = client?.channel(`expenses-${owner}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "expenses", filter: `user_id=eq.${owner}` }, sync)
      .on("postgres_changes", { event: "*", schema: "public", table: "expense_budgets", filter: `user_id=eq.${owner}` }, sync)
      .subscribe((status) => { if (active) { setLive(status === "SUBSCRIBED"); if (status === "SUBSCRIBED") void sync(); } });
    const refresh = () => { if (document.visibilityState !== "hidden") void sync(); };
    const interval = setInterval(refresh, 30_000);
    window.addEventListener("online", refresh); window.addEventListener("storage", refresh); document.addEventListener("visibilitychange", refresh);
    return () => {
      active = false; syncRef.current = null;
      clearTimeout(timer); clearInterval(interval);
      window.removeEventListener("online", refresh); window.removeEventListener("storage", refresh); document.removeEventListener("visibilitychange", refresh);
      if (channel) void client!.removeChannel(channel);
    };
  }, [owner, storageKey, budgetKey, reload]);

  async function write(action: () => Promise<void>) {
    if (!snapshot) throw new Error("Wait for expenses to load before saving.");
    if (writing.current) throw new Error("Another expense or budget is saving. Try again in a moment.");
    writing.current = true; setSaving(true); generation.current++;
    try { await action(); setError(""); }
    finally { generation.current++; writing.current = false; setSaving(false); await syncRef.current?.(); }
  }
  async function mutate(previous: Expense | null, next: Expense | null) {
    await write(async () => {
      const client = getSupabase();
      if (client) {
        const response = previous
          ? await (next ? client.from("expenses").update(expenseRow(next)) : client.from("expenses").delete()).eq("user_id", owner).eq("id", previous.id).eq("version", previous.version).select().maybeSingle()
          : await client.from("expenses").insert(expenseRow(next!)).select().single();
        if (response.error) throw new Error("Couldn’t save the expense to Supabase. Check your connection and retry.");
        if (!response.data) throw new Error("This expense changed on another device. Close the editor and reopen the latest entry.");
      } else {
        if (cloudConfigured) throw new Error("Sign in to save expenses.");
        const update = () => {
          const current = parseExpenses(localStorage.getItem(storageKey));
          if (previous && JSON.stringify(current.find((item) => item.id === previous.id)) !== JSON.stringify(previous)) throw new Error("This expense changed in another tab. Reopen it and try again.");
          localStorage.setItem(storageKey, JSON.stringify([...current.filter((item) => item.id !== (previous?.id ?? next?.id)), ...(next ? [next] : [])]));
        };
        if (navigator.locks) await navigator.locks.request(storageKey, update); else update();
      }
    });
  }
  async function saveBudget(month: string, cents: number, previous: BudgetRow | undefined) {
    await write(async () => {
      const client = getSupabase();
      if (client) {
        const response = previous
          ? await client.from("expense_budgets").update({ amount_cents: cents }).eq("user_id", owner).eq("month", month).eq("version", previous.version).select().maybeSingle()
          : await client.from("expense_budgets").insert({ month, amount_cents: cents }).select().single();
        if (response.error || !response.data) throw new Error("Couldn’t save the starting amount. It may have changed on another device. Reopen the latest budget and retry.");
      } else {
        if (cloudConfigured) throw new Error("Sign in to save budgets.");
        const update = () => {
          const current = readBudgets(localStorage.getItem(budgetKey));
          if (current[month] !== previous?.amount_cents) throw new Error("This starting amount changed in another tab. Reopen it and retry.");
          localStorage.setItem(budgetKey, JSON.stringify({ ...current, [month]: cents }));
        };
        if (navigator.locks) await navigator.locks.request(budgetKey, update); else update();
      }
    });
  }
  return { expenses: snapshot?.expenses ?? [], budgets: snapshot?.budgets ?? [], ready: snapshot !== null, error, importWarning, saving, live, cloud: cloudConfigured, mutate, saveBudget, retry: () => setReload((value) => value + 1) };
}
