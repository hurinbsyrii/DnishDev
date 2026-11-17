"use client";

import { useEffect, useId, useMemo, useState, type FormEvent } from "react";
import { ArrowUpRight, Bell, BellRing, Check, Plus, Trash2 } from "lucide-react";
import { formatDate, type Project } from "@/lib/projects";
import { emptyReminderData, parseReminderData, reminderSchedule, taskReminderItems, validSettings, type CustomReminder, type ReminderData, type ReminderItem, type ReminderSettings } from "@/lib/reminders";
import { Modal } from "./ui";

const dateTime = (stamp: number) => new Intl.DateTimeFormat("en-MY", { timeZone: "Asia/Kuala_Lumpur", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }).format(stamp);

const repeatOptions = [
  { hours: 0, label: "Once only" },
  { hours: 1, label: "Every hour" },
  { hours: 24, label: "Daily" },
  { hours: 48, label: "Every 2 days" },
  { hours: 168, label: "Weekly" },
];

function SettingsFields({ value, onChange }: { value: ReminderSettings; onChange: (settings: ReminderSettings) => void }) {
  const frequencyId = useId();
  const options = repeatOptions.some((option) => option.hours === value.repeatHours)
    ? repeatOptions : [...repeatOptions, { hours: value.repeatHours, label: `Every ${value.repeatHours} hours (saved)` }];
  return <>
    <label className="field">Start reminding before (days)<input type="number" min="0" max="365" step="1" required value={value.daysBefore} onChange={(event) => onChange({ ...value, daysBefore: event.target.valueAsNumber })} /><small className="muted">0 means on the due date. Default: 3 days.</small></label>
    <label className="field">Default reminder time (MYT)<input type="time" required value={value.time} onChange={(event) => onChange({ ...value, time: event.target.value })} /><small className="muted">Used for deadlines without a set time.</small></label>
    <fieldset className="reminder-frequency full">
      <legend>Repeat reminders</legend>
      <div className="reminder-frequency-options">{options.map((option) => <label className="reminder-frequency-option" key={option.hours}>
        <input type="radio" name={frequencyId} value={option.hours} checked={value.repeatHours === option.hours} onChange={() => onChange({ ...value, repeatHours: option.hours })} />
        <span>{option.label}</span>
      </label>)}</div>
    </fieldset>
  </>;
}

function SettingsForm({ settings, save }: { settings: ReminderSettings; save: (settings: ReminderSettings) => Promise<boolean> }) {
  const [draft, setDraft] = useState(settings);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!validSettings(draft)) return setError("Enter whole numbers within the allowed ranges and a valid time.");
    setBusy(true);
    await save(draft);
    setBusy(false);
  }
  return <form className="form-grid" onSubmit={submit}>
    <label className="reminder-check full"><input type="checkbox" checked={draft.enabled} onChange={(event) => setDraft({ ...draft, enabled: event.target.checked })} />Enable reminders</label>
    <SettingsFields value={draft} onChange={setDraft} />
    <p className="muted full">Reminders repeat until the item is completed. Dismissing a reminder hides it until the next interval.</p>
    {error && <p className="form-error full" role="alert">{error}</p>}
    <div className="modal-actions full"><button className="button primary" disabled={busy}>{busy ? "Saving…" : "Save preferences"}</button></div>
  </form>;
}

function ReminderEditor({ item, defaults, today, close, save }: { item: CustomReminder | null; defaults: ReminderSettings; today: string; close: () => void; save: (item: CustomReminder) => Promise<boolean> }) {
  const [useDefaults, setUseDefaults] = useState(!item?.settings);
  const [settings, setSettings] = useState(item?.settings ?? defaults);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const title = String(form.get("title") ?? "").trim();
    if (!title || (!useDefaults && !validSettings(settings))) return setError("Enter a title and valid reminder settings.");
    setBusy(true);
    const saved = await save({ id: item?.id ?? crypto.randomUUID(), title, date: String(form.get("date")), time: String(form.get("time")), completed: item?.completed ?? false, ...(!useDefaults ? { settings } : {}) });
    if (saved) close();
    else { setError("Couldn’t save this reminder. Check browser storage and try again."); setBusy(false); }
  }
  return <Modal title={item ? "Edit reminder" : "New reminder"} caption="Keep follow-ups, renewals and personal deadlines in view." onClose={close}>
    <form className="form-grid" onSubmit={submit}>
      <label className="field full">Reminder title<input name="title" required autoFocus maxLength={120} defaultValue={item?.title ?? ""} placeholder="e.g. Follow up with client" /></label>
      <label className="field">Due date<input name="date" type="date" required defaultValue={item?.date ?? today} /></label>
      <label className="field">Due time (MYT)<input name="time" type="time" required defaultValue={item?.time ?? defaults.time} /></label>
      <label className="reminder-check full"><input type="checkbox" checked={useDefaults} onChange={(event) => setUseDefaults(event.target.checked)} />Use my default reminder preferences</label>
      {!useDefaults && <SettingsFields value={settings} onChange={setSettings} />}
      {error && <p className="form-error full" role="alert">{error}</p>}
      <div className="modal-actions full"><button type="button" className="button quiet" onClick={close}>Cancel</button><button className="button primary" disabled={busy}>{busy ? "Saving…" : "Save reminder"}</button></div>
    </form>
  </Modal>;
}

export function Reminders({ owner, projects, active, today, onOpen, onTasks, onReminders }: { owner: string; projects: Project[]; active: boolean; today: string; onOpen: (project: Project) => void; onTasks: () => void; onReminders: () => void }) {
  const storageKey = `devdash-reminders-v1-${owner}`;
  const taskKey = `devdash-tasks-v1-${owner}`;
  const [snapshot, setSnapshot] = useState(() => {
    try { return { data: parseReminderData(localStorage.getItem(storageKey)), error: "" }; }
    catch { return { data: emptyReminderData(), error: "Couldn’t load reminders. Your saved data is kept. Check browser storage and reload." }; }
  });
  const [taskSnapshot, setTaskSnapshot] = useState(() => {
    try { return { items: taskReminderItems(localStorage.getItem(taskKey)), error: "" }; }
    catch { return { items: [] as ReminderItem[], error: "Couldn’t read to-do deadlines. Check the To-do tab." }; }
  });
  const [now, setNow] = useState(() => Date.now());
  const [editor, setEditor] = useState<{ item: CustomReminder | null } | null>(null);
  const [deleting, setDeleting] = useState<CustomReminder | null>(null);
  const [customizePreferences, setCustomizePreferences] = useState(false);
  const [message, setMessage] = useState("");
  const [permission, setPermission] = useState(() => typeof Notification === "undefined" ? "unsupported" : Notification.permission);
  const [notificationError, setNotificationError] = useState("");
  const { data, error } = snapshot;
  const items = useMemo<ReminderItem[]>(() => [
    ...projects.flatMap((project) => project.end_date && !project.completed_date ? [{ id: `project-${project.id}`, title: project.name, date: project.end_date, source: "Project" as const, projectId: project.id }] : []),
    ...taskSnapshot.items,
    ...data.custom.filter((item) => !item.completed).map((item) => ({ ...item, id: `custom-${item.id}`, source: "Custom" as const })),
  ], [projects, taskSnapshot.items, data.custom]);
  const scheduled = items.map((item) => ({ item, schedule: reminderSchedule(item, data.settings, now) }))
    .filter((entry) => entry.schedule !== null).sort((a, b) => a.schedule!.dueAt - b.schedule!.dueAt);
  const due = scheduled.filter(({ schedule }) => schedule!.currentAt !== null && (data.acknowledged[schedule!.key] ?? -1) < schedule!.currentAt!);

  useEffect(() => {
    function sync() {
      try { setSnapshot({ data: parseReminderData(localStorage.getItem(storageKey)), error: "" }); }
      catch { setSnapshot((previous) => ({ ...previous, error: "Couldn’t refresh reminders. Your saved data has been kept." })); }
      try { setTaskSnapshot({ items: taskReminderItems(localStorage.getItem(taskKey)), error: "" }); }
      catch { setTaskSnapshot((previous) => ({ ...previous, error: "Couldn’t refresh to-do deadlines. Check the To-do tab." })); }
      setNow(Date.now());
      setPermission(typeof Notification === "undefined" ? "unsupported" : Notification.permission);
    }
    const timer = setInterval(sync, 15_000);
    window.addEventListener("storage", sync);
    window.addEventListener("devdash-tasks-changed", sync);
    document.addEventListener("visibilitychange", sync);
    return () => { clearInterval(timer); window.removeEventListener("storage", sync); window.removeEventListener("devdash-tasks-changed", sync); document.removeEventListener("visibilitychange", sync); };
  }, [storageKey, taskKey]);

  useEffect(() => {
    if (permission !== "granted" || error) return;
    let cancelled = false;
    async function notify() {
      if (cancelled) return;
      try {
        const latest = parseReminderData(localStorage.getItem(storageKey));
        const pending = items.map((item) => ({ item, schedule: reminderSchedule(item, latest.settings, Date.now()) })).filter(({ schedule }) => schedule?.currentAt !== null && schedule?.currentAt !== undefined
          && (latest.notified[schedule.key] ?? -1) < schedule.currentAt && (latest.acknowledged[schedule.key] ?? -1) < schedule.currentAt);
        if (!pending.length) return;
        const notification = new Notification(`DevDash · ${pending.length} ${pending.length === 1 ? "reminder" : "reminders"}`, { body: pending.slice(0, 3).map(({ item }) => item.title).join(" · "), tag: `devdash-${owner}` });
        notification.onclick = () => { window.focus(); onReminders(); notification.close(); };
        for (const { schedule } of pending) latest.notified[schedule!.key] = schedule!.currentAt!;
        localStorage.setItem(storageKey, JSON.stringify(latest));
        if (!cancelled) setSnapshot({ data: latest, error: "" });
      } catch { if (!cancelled) setNotificationError("Browser notifications couldn’t be delivered. Your in-app reminders are still available."); }
    }
    if (navigator.locks) void navigator.locks.request(storageKey, notify);
    else void notify();
    return () => { cancelled = true; };
  }, [items, now, permission, error, storageKey, owner, onReminders]);

  async function persist(update: (current: ReminderData) => ReminderData, announcement = "") {
    const write = () => {
      try {
        const next = update(parseReminderData(localStorage.getItem(storageKey)));
        parseReminderData(JSON.stringify(next));
        localStorage.setItem(storageKey, JSON.stringify(next));
        setSnapshot({ data: next, error: "" });
        setMessage(announcement);
        return true;
      } catch (reason) {
        setSnapshot((previous) => ({ ...previous, error: reason instanceof Error && reason.message.startsWith("This reminder") ? reason.message : "Couldn’t save reminders. Check browser storage and try again. Your saved data has been kept." }));
        return false;
      }
    };
    return navigator.locks ? navigator.locks.request(storageKey, write) : write();
  }

  async function enableNotifications() {
    try { setPermission(await Notification.requestPermission()); setNotificationError(""); }
    catch { setNotificationError("Couldn’t enable browser notifications. Check your browser’s site permissions."); }
  }

  function openItem(item: ReminderItem) {
    if (item.source === "Project") { const project = projects.find((project) => project.id === item.projectId); if (project) onOpen(project); }
    else if (item.source === "To-do") onTasks();
    else { const custom = data.custom.find((custom) => `custom-${custom.id}` === item.id); if (custom) setEditor({ item: custom }); }
  }

  if (!active) return due.length ? <div className="reminder-banner" role="status"><span><BellRing size={17} />{due.length} {due.length === 1 ? "reminder needs" : "reminders need"} your attention</span><button className="button quiet" onClick={onReminders}>View reminders <ArrowUpRight size={15} /></button></div> : null;

  return <div className="reminders-page">
    {(error || taskSnapshot.error || notificationError) && <p className="error-banner" role="alert">{error || taskSnapshot.error || notificationError}</p>}
    <p className="reminder-message" role="status">{message}</p>
    <section className="card reminder-list" aria-labelledby="reminder-list-heading">
      <div className="card-heading"><div><h2 id="reminder-list-heading">Reminders <span className="period-tag">{due.length} need attention</span></h2><p className="muted">Project deadlines, to-do due dates and your own follow-ups.</p></div><div className="reminder-toolbar-actions"><button className="button quiet" aria-haspopup="dialog" onClick={() => setCustomizePreferences(true)}>Customize</button><button className="button primary" onClick={() => setEditor({ item: null })}><Plus size={16} />New reminder</button></div></div>
      {!data.settings.enabled && <p className="empty">Reminders are paused. Enable them in your preferences to resume.</p>}
      {data.settings.enabled && !scheduled.length && <p className="empty">No deadlines to remind you about. Create a reminder or add a project or to-do due date.</p>}
      {scheduled.map(({ item, schedule }) => {
        const needsAttention = due.some((entry) => entry.item.id === item.id);
        const next = needsAttention ? schedule!.currentAt : schedule!.nextAt;
        const custom = item.source === "Custom" ? data.custom.find((entry) => `custom-${entry.id}` === item.id) : undefined;
        return <article className={`reminder-row${needsAttention ? " needs-attention" : ""}`} key={item.id}>
          <span className="metric-icon"><Bell size={17} /></span>
          <div className="reminder-row-copy"><span className="reminder-source">{item.source}{needsAttention ? " · Reminder due" : ""}</span><button className="reminder-title" onClick={() => openItem(item)}>{item.title}</button><p className="muted">Due {formatDate(item.date, { day: "numeric", month: "short", year: "numeric" })}{item.time ? ` at ${item.time} MYT` : ""}{schedule!.dueAt < now ? " · Overdue" : ""}</p><small className="muted">{needsAttention ? `Reminder from ${dateTime(next!)}` : next ? `Next reminder ${dateTime(next)}` : "Reminder dismissed · No repeat scheduled"}</small></div>
          <div className="reminder-row-actions">{needsAttention && <button className="button quiet" onClick={() => void persist((current) => ({ ...current, acknowledged: { ...current.acknowledged, [schedule!.key]: schedule!.currentAt! } }), "Reminder dismissed for this interval.")}>Dismiss</button>}{custom && <><button className="icon-button" aria-label={`Complete ${item.title}`} onClick={() => void persist((current) => ({ ...current, custom: current.custom.map((entry) => entry.id === custom.id ? { ...entry, completed: true } : entry) }), "Reminder completed.")}><Check size={16} /></button><button className="icon-button" aria-label={`Delete ${item.title}`} onClick={() => setDeleting(custom)}><Trash2 size={15} /></button></>}<button className="icon-button" aria-label={custom ? `Edit ${item.title}` : `Open ${item.title}`} onClick={() => openItem(item)}><ArrowUpRight size={16} /></button></div>
        </article>;
      })}
    </section>
    {customizePreferences && <Modal title="Your reminder preferences" caption="Personal to your account in this browser · Malaysia time" onClose={() => setCustomizePreferences(false)}>
      <SettingsForm key={JSON.stringify(data.settings)} settings={data.settings} save={async (settings) => {
        const saved = await persist((current) => ({ ...current, settings }), "Reminder preferences saved.");
        if (saved) setCustomizePreferences(false);
        return saved;
      }} />
      {error && <p className="form-error" role="alert">{error}</p>}
      <section className="reminder-delivery" aria-labelledby="reminder-delivery-heading">
        <h3 id="reminder-delivery-heading">Browser notifications</h3>
        <p className="muted">Optional browser notifications work while DevDash is open. Reopen the app to catch reminders you missed.</p>
        <p className="reminder-delivery-status"><BellRing size={18} />{permission === "granted" ? "Browser notifications enabled" : permission === "denied" ? "Browser notifications blocked" : permission === "unsupported" ? "Browser notifications unavailable" : "Browser notifications not enabled"}</p>
        {permission === "default" && <button className="button quiet" onClick={enableNotifications}>Enable browser notifications</button>}
        {permission === "denied" && <p className="muted">Allow notifications in your browser’s site settings to enable them here.</p>}
        {notificationError && <p className="form-error" role="alert">{notificationError}</p>}
      </section>
    </Modal>}
    {editor && <ReminderEditor item={editor.item} defaults={data.settings} today={today} close={() => setEditor(null)} save={(item) => persist((current) => {
      if (editor.item && !current.custom.some((entry) => entry.id === item.id)) throw new Error("This reminder was removed in another tab. Close the editor and create a new one.");
      return { ...current, custom: editor.item ? current.custom.map((entry) => entry.id === item.id ? item : entry) : [...current.custom, item] };
    }, "Reminder saved.")} />}
    {deleting && <Modal title="Delete reminder?" caption={deleting.title} onClose={() => setDeleting(null)}><p className="muted">This removes the custom reminder and stops its notifications.</p><div className="modal-actions"><button className="button quiet" onClick={() => setDeleting(null)}>Cancel</button><button className="button danger" onClick={async () => { if (await persist((current) => ({ ...current, custom: current.custom.filter((item) => item.id !== deleting.id) }), "Reminder deleted.")) setDeleting(null); }}>Delete reminder</button></div></Modal>}
  </div>;
}
