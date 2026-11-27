"use client";

import { useEffect, useRef, useState } from "react";
import { cloudConfigured, getSupabase } from "./supabase";
import { newSheet, readDemoSheet, sheetError, type MoneyRow, type MoneySheet } from "./money";

class Conflict extends Error {}

const columns = (sheet: MoneySheet) => ({
  month: sheet.month, budget_cents: sheet.budget_cents, emergency_cents: sheet.emergency_cents, accounts: sheet.accounts, plan: sheet.plan,
});
const fromRow = (row: MoneyRow): MoneyRow => ({
  ...columns({ ...row, budget_cents: Number(row.budget_cents), emergency_cents: Number(row.emergency_cents), accounts: row.accounts ?? [], plan: row.plan ?? [] }),
  version: row.version,
});

/**
 * One money sheet per account. Edits show immediately and save shortly after
 * the last change; a save is rejected when another device changed the sheet
 * first, and the latest version is loaded instead.
 */
export function useMoneySheet(owner: string, month: string) {
  const [server, setServer] = useState<MoneyRow | null | undefined>(undefined);
  const [draft, setDraft] = useState<MoneySheet | null>(null);
  const [fresh] = useState(() => newSheet(month));
  const [error, setError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [saving, setSaving] = useState(false);
  const [live, setLive] = useState(false);
  const [reload, setReload] = useState(0);
  const storageKey = `devdash:money:${owner}`;
  const base = useRef(0);
  const pending = useRef<MoneySheet | null>(null);
  const inFlight = useRef(false);
  // Bumped around every save so a load that started earlier can't overwrite it.
  const generation = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const syncRef = useRef<(() => Promise<void>) | null>(null);
  const flushRef = useRef<() => Promise<void>>(async () => {});

  useEffect(() => {
    let active = true;
    let request = 0;
    const client = getSupabase();
    async function sync() {
      const current = ++request;
      const started = generation.current;
      try {
        let row: MoneyRow | null;
        if (client) {
          const { data, error } = await client.from("money_sheets").select("*").eq("user_id", owner).maybeSingle();
          if (error) throw error;
          row = data ? fromRow(data as MoneyRow) : null;
        } else row = readDemoSheet(localStorage.getItem(storageKey));
        if (!active || current !== request || started !== generation.current) return;
        setError("");
        // Unsaved local edits win until they are saved; a rejected save reloads.
        if (pending.current || inFlight.current) return;
        base.current = row?.version ?? 0;
        setServer(row);
        setDraft(null);
      } catch {
        if (active && current === request) setError(client
          ? "Couldn’t load your money sheet. Check your connection and apply the money sheet Supabase migration, then retry."
          : "Couldn’t load the demo money sheet. Check browser storage and retry.");
      }
    }
    syncRef.current = sync;
    const timeout = setTimeout(() => void sync(), 0);
    const channel = client?.channel(`money-${owner}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "money_sheets", filter: `user_id=eq.${owner}` }, sync)
      .subscribe((status) => { if (active) { setLive(status === "SUBSCRIBED"); if (status === "SUBSCRIBED") void sync(); } });
    const refresh = () => {
      if (document.visibilityState === "hidden") void flushRef.current();
      else void sync();
    };
    const leave = () => void flushRef.current();
    const interval = setInterval(refresh, 30_000);
    window.addEventListener("online", refresh); window.addEventListener("storage", refresh); window.addEventListener("pagehide", leave);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      active = false; syncRef.current = null;
      clearTimeout(timeout); clearInterval(interval);
      window.removeEventListener("online", refresh); window.removeEventListener("storage", refresh); window.removeEventListener("pagehide", leave);
      document.removeEventListener("visibilitychange", refresh);
      if (channel) void client!.removeChannel(channel);
      leave();
    };
  }, [owner, storageKey, reload]);

  async function persist(sheet: MoneySheet, version: number): Promise<MoneyRow> {
    const client = getSupabase();
    if (client) {
      const response = version
        ? await client.from("money_sheets").update(columns(sheet)).eq("user_id", owner).eq("version", version).select().maybeSingle()
        : await client.from("money_sheets").insert(columns(sheet)).select().single();
      if (response.error?.code === "23505") throw new Conflict();
      if (response.error) throw new Error(response.error.code === "PGRST205" || response.error.code === "42P01"
        ? "Apply the money sheet Supabase migration, then retry."
        : "Couldn’t save to Supabase. Check your connection and retry.");
      if (!response.data) throw new Conflict();
      return fromRow(response.data as MoneyRow);
    }
    if (cloudConfigured) throw new Error("Sign in to save your money sheet.");
    const write = () => {
      if ((readDemoSheet(localStorage.getItem(storageKey))?.version ?? 0) !== version) throw new Conflict();
      const row = { ...columns(sheet), version: version + 1 };
      localStorage.setItem(storageKey, JSON.stringify(row));
      return row;
    };
    return navigator.locks ? await navigator.locks.request(storageKey, write) : write();
  }

  async function flush() {
    clearTimeout(timer.current);
    const sheet = pending.current;
    if (inFlight.current || !sheet) return;
    const problem = sheetError(sheet);
    if (problem) { setSaveError(problem); return; }
    pending.current = null; inFlight.current = true; setSaving(true); generation.current++;
    let outcome: "saved" | "failed" | "conflict" = "saved";
    try {
      const saved = await persist(sheet, base.current);
      base.current = saved.version;
      setServer(saved);
      if (!pending.current) setDraft(null);
      setSaveError("");
    } catch (reason) {
      if (reason instanceof Conflict) {
        outcome = "conflict";
        pending.current = null;
        setDraft(null);
        setSaveError("Your money sheet changed on another device, so the latest version is shown. Re-enter your last change if it’s missing.");
      } else {
        outcome = "failed";
        pending.current ??= sheet;
        setSaveError(reason instanceof Error ? reason.message : "Couldn’t save your money sheet.");
      }
    } finally {
      inFlight.current = false; setSaving(false); generation.current++;
    }
    if (outcome === "conflict") await syncRef.current?.();
    else if (outcome === "saved" && pending.current) await flush();
  }
  useEffect(() => { flushRef.current = flush; });

  /** Shows the change now and saves it shortly after the last edit. */
  function save(next: MoneySheet) {
    setDraft(next);
    pending.current = next;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => void flushRef.current(), 700);
  }

  return {
    sheet: draft ?? server ?? fresh,
    started: Boolean(server || draft),
    ready: server !== undefined,
    unsaved: draft !== null,
    error, saveError, saving, live, cloud: cloudConfigured,
    save,
    saveNow: (next: MoneySheet) => { save(next); return flush(); },
    retry: () => { setSaveError(""); if (pending.current) void flush(); else setReload((value) => value + 1); },
  };
}
