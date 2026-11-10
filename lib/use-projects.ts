"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { demoProjects, type Project, type ProjectChange } from "./projects";
import { cloudConfigured, getSupabase } from "./supabase";

const storageKey = "dnishdev-projects-v1";

function readDemo(today: string): Project[] {
  const stored = localStorage.getItem(storageKey);
  if (stored) {
    try {
      const value = JSON.parse(stored);
      if (Array.isArray(value)) return value;
    } catch {
      // Unreadable demo data can be replaced by the original sample.
    }
  }
  const sample = demoProjects(today);
  localStorage.setItem(storageKey, JSON.stringify(sample));
  return sample;
}

export function useProjects(initialDay: string) {
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(!cloudConfigured);
  const [snapshot, setSnapshot] = useState<{ owner: string; projects: Project[] } | null>(null);
  const [loadError, setLoadError] = useState("");
  const [live, setLive] = useState(false);
  const [reload, setReload] = useState(0);
  const resync = useRef<(() => void) | null>(null);
  const userId = session?.user.id;
  const owner = cloudConfigured ? userId : "demo";

  useEffect(() => {
    const client = getSupabase();
    if (!client) return;
    const { data: { subscription } } = client.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setAuthReady(true);
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    const client = getSupabase();
    if (!client) {
      const sync = () => {
        try {
          setSnapshot({ owner: "demo", projects: readDemo(initialDay) });
          setLoadError("");
        } catch {
          setLoadError("Browser storage is unavailable. Enable it to use the demo workspace.");
        }
      };
      window.addEventListener("storage", sync);
      const timer = setTimeout(sync, 0);
      return () => { clearTimeout(timer); window.removeEventListener("storage", sync); };
    }
    if (!userId) return;

    let request = 0;
    let active = true;
    async function sync() {
      if (!client || !active || document.visibilityState === "hidden") return;
      const current = ++request;
      const projects: Project[] = [];
      const pageSize = 500;
      try {
        for (let offset = 0; ; offset += pageSize) {
          const { data, error } = await client.from("projects").select("*")
            .eq("user_id", userId).order("id").range(offset, offset + pageSize - 1);
          if (!active || current !== request) return;
          if (error) throw error;
          projects.push(...data);
          if (data.length < pageSize) break;
        }
        setLoadError("");
        setSnapshot({ owner: userId!, projects });
      } catch {
        if (active && current === request) setLoadError("Couldn’t load your projects. Check the Supabase migration and try again.");
      }
    }

    resync.current = sync;
    const timer = setTimeout(sync, 0);
    const channel = client.channel(`workspace-${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "projects" }, sync)
      .subscribe((status) => {
        if (!active) return;
        setLive(status === "SUBSCRIBED");
        if (status === "SUBSCRIBED") void sync();
      });
    const polling = setInterval(sync, 30_000);
    document.addEventListener("visibilitychange", sync);
    return () => {
      active = false;
      resync.current = null;
      clearTimeout(timer);
      clearInterval(polling);
      document.removeEventListener("visibilitychange", sync);
      void client.removeChannel(channel);
    };
  }, [initialDay, reload, userId]);

  const mutate = useCallback(async (project: Project | null, change: ProjectChange | null) => {
    const client = getSupabase();
    const conflict = "This project changed in another tab. Reopen it to see the latest version.";
    if (client && userId) {
      const table = client.from("projects");
      const response = !project
        ? await table.insert(change!).select().single()
        : await (change ? table.update(change) : table.delete()).eq("id", project.id)
          .eq("user_id", userId).eq("version", project.version).select().maybeSingle();
      if (response.error) throw new Error(response.error.message);
      resync.current?.();
      if (!response.data) throw new Error(conflict);
      setSnapshot((current) => {
        if (!current || current.owner !== userId) return current;
        const updated = response.data as Project;
        const previous = current.projects.find((item) => item.id === updated.id);
        if (previous && previous.version > updated.version) return current;
        return { owner: userId, projects: [...current.projects.filter((item) => item.id !== updated.id), ...(change ? [updated] : [])] };
      });
      return;
    }

    if (cloudConfigured) throw new Error("Sign in to save changes.");
    const saveDemo = () => {
      const projects = readDemo(initialDay);
      if (project && projects.find((item) => item.id === project.id)?.version !== project.version) throw new Error(conflict);
      const updated = { ...project, ...change, id: project?.id ?? crypto.randomUUID(), version: (project?.version ?? 0) + 1 } as Project;
      const next = [...projects.filter((item) => item.id !== updated.id), ...(change ? [updated] : [])];
      localStorage.setItem(storageKey, JSON.stringify(next));
      setSnapshot({ owner: "demo", projects: next });
    };
    if (navigator.locks) await navigator.locks.request(storageKey, saveDemo);
    else saveDemo();
  }, [initialDay, userId]);

  return {
    session, authReady, live: Boolean(userId) && live,
    projects: owner && snapshot?.owner === owner ? snapshot.projects : [],
    loading: Boolean(owner && snapshot?.owner !== owner && !loadError),
    loadError: owner ? loadError : "",
    retry: () => setReload((value) => value + 1),
    mutate,
  };
}
