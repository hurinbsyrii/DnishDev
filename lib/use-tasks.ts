"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { cloudConfigured, getSupabase } from "./supabase";
import { parseTasks, taskFromRow, taskRow, type Task, type TaskRow } from "./tasks";

export function useTasks(owner: string | null) {
  const [snapshot, setSnapshot] = useState<{ owner: string; tasks: Task[] } | null>(null);
  const [error, setError] = useState("");
  const [importWarning, setImportWarning] = useState("");
  const [live, setLive] = useState(false);
  const [saving, setSaving] = useState(false);
  const [reload, setReload] = useState(0);
  const syncRef = useRef<(() => Promise<void>) | null>(null);
  const generation = useRef(0);
  const writing = useRef(false);
  const storageKey = `devdash-tasks-v1-${owner}`;

  useEffect(() => {
    if (!owner) return;
    let active = true;
    let request = 0;
    const client = getSupabase();
    async function sync() {
      const current = ++request;
      const started = generation.current;
      try {
        const tasks: Task[] = [];
        if (client) {
          for (let offset = 0; ; offset += 500) {
            const { data, error } = await client.from("tasks").select("*").eq("user_id", owner).order("id").range(offset, offset + 499);
            if (error) throw error;
            tasks.push(...(data as TaskRow[]).map(taskFromRow));
            if (data.length < 500) break;
          }
        } else tasks.push(...parseTasks(localStorage.getItem(storageKey)));
        if (!active || current !== request || started !== generation.current) return;
        setSnapshot({ owner: owner!, tasks });
        setError("");
      } catch {
        if (active && current === request) setError(client ? "Couldn’t sync the board. Check your connection and apply the synced tasks Supabase migration, then retry." : "Couldn’t load the demo board. Check browser storage and retry.");
      }
    }
    async function initialize() {
      if (client) {
        try {
          const tasks = parseTasks(localStorage.getItem(storageKey));
          if (tasks.length) {
            const raw = JSON.stringify(tasks.map((task, index) => taskRow(task, index)));
            const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw));
            const key = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
            const { error } = await client.rpc("import_browser_tasks", { p_import_key: key, p_tasks: JSON.parse(raw) });
            if (error) throw error;
          }
          if (active) setImportWarning("");
        } catch {
          if (active) setImportWarning("Your browser tasks are still kept on this device, but couldn’t be imported. Apply the synced tasks migration and retry from this browser.");
        }
      }
      if (active) await sync();
    }
    syncRef.current = sync;
    const timer = setTimeout(() => void initialize(), 0);
    const channel = client?.channel(`tasks-${owner}`).on("postgres_changes", { event: "*", schema: "public", table: "tasks", filter: `user_id=eq.${owner}` }, sync)
      .subscribe((status) => { if (active) { setLive(status === "SUBSCRIBED"); if (status === "SUBSCRIBED") void sync(); } });
    const refresh = () => { if (document.visibilityState !== "hidden") void sync(); };
    const interval = setInterval(refresh, 30_000);
    window.addEventListener("storage", refresh);
    window.addEventListener("online", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      active = false;
      syncRef.current = null;
      clearTimeout(timer); clearInterval(interval);
      window.removeEventListener("storage", refresh); window.removeEventListener("online", refresh);
      document.removeEventListener("visibilitychange", refresh);
      if (channel) void client!.removeChannel(channel);
    };
  }, [owner, storageKey, reload]);

  const ready = Boolean(owner && snapshot?.owner === owner);
  const mutate = useCallback(async (previous: Task | null, next: Task | null) => {
    if (!owner || !ready) throw new Error("Wait for the board to finish loading before saving.");
    if (writing.current) throw new Error("Another task is saving. Try again in a moment.");
    writing.current = true;
    setSaving(true);
    generation.current++;
    try {
      const client = getSupabase();
      if (client) {
        const response = previous
          ? await (next ? client.from("tasks").update(taskRow(next)) : client.from("tasks").delete())
            .eq("user_id", owner).eq("id", previous.id).eq("version", previous.version).select().maybeSingle()
          : await client.from("tasks").insert(taskRow(next!)).select().single();
        generation.current++;
        if (response.error) throw new Error("Couldn’t save this task to Supabase. Check your connection and retry.");
        if (!response.data) {
          throw new Error("This task changed on another device or was deleted. Close the editor and reopen the latest task.");
        }
        const updated = taskFromRow(response.data as TaskRow);
        setSnapshot((current) => current?.owner === owner ? { owner, tasks: [...current.tasks.filter((task) => task.id !== updated.id), ...(next ? [updated] : [])] } : current);
      } else {
        if (cloudConfigured) throw new Error("Sign in to save tasks.");
        const write = () => {
          const tasks = parseTasks(localStorage.getItem(storageKey));
          const existing = previous && tasks.find((task) => task.id === previous.id);
          if (previous && (!existing || JSON.stringify(existing) !== JSON.stringify(previous))) throw new Error("This task changed in another tab. Close the editor and reopen it.");
          const updated = next ? { ...next, version: (previous?.version ?? 0) + 1 } : null;
          const result = [...tasks.filter((task) => task.id !== (previous?.id ?? next?.id)), ...(updated ? [updated] : [])];
          localStorage.setItem(storageKey, JSON.stringify(result));
          generation.current++;
          setSnapshot({ owner, tasks: result });
        };
        if (navigator.locks) await navigator.locks.request(storageKey, write);
        else write();
      }
      setError("");
    } finally { generation.current++; writing.current = false; setSaving(false); void syncRef.current?.(); }
  }, [owner, ready, storageKey]);

  return { tasks: ready ? snapshot!.tasks : [], ready, error, importWarning, saving, live: cloudConfigured && live,
    loading: Boolean(owner && !ready && !error), cloud: cloudConfigured, mutate, retry: () => setReload((value) => value + 1) };
}
export type TaskStore = ReturnType<typeof useTasks>;
