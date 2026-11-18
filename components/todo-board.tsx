"use client";

import { useEffect, useState, type FormEvent } from "react";
import { CalendarDays, CheckCheck, Circle, CircleCheck, Clock3, GripVertical, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { formatDate } from "@/lib/projects";
import { Modal } from "./ui";
import { priorities, type Task, type TaskStatus as Status } from "@/lib/tasks";
import type { TaskStore } from "@/lib/use-tasks";

const columns = [
  { id: "todo", title: "To do", caption: "Ready when you are", icon: Circle },
  { id: "progress", title: "In progress", caption: "One step at a time", icon: Clock3 },
  { id: "done", title: "Done", caption: "A little closer to the finish", icon: CircleCheck },
] as const;
type Editor = { task: Task | null; status: Status };
const pageSize = 10;
const initialLimits: Record<Status, number> = { todo: pageSize, progress: pageSize, done: pageSize };

export function TodoBoard({ board, today }: { board: TaskStore; today: string }) {
  const { tasks, saving } = board;
  const [mutationError, setMutationError] = useState("");
  const error = mutationError || board.error;
  const [editor, setEditor] = useState<Editor | null>(null);
  const [deleting, setDeleting] = useState<Task | null>(null);
  const [query, setQuery] = useState("");
  const [priority, setPriority] = useState("");
  const [limits, setLimits] = useState(initialLimits);
  const [dragging, setDragging] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<Status | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(timer);
  }, []);

  async function persist(previous: Task | null, next: Task | null, message: string) {
    setMutationError("");
    try {
      await board.mutate(previous, next);
      setAnnouncement(message);
      return true;
    } catch (reason) {
      setMutationError(reason instanceof Error ? reason.message : "Couldn’t save the task. Try again.");
      return false;
    }
  }

  async function move(id: string, status: Status, enteredAt: number) {
    const task = tasks.find((task) => task.id === id);
    if (!task || task.status === status) return;
    await persist(task, { ...task, status, columnEnteredAt: enteredAt }, `Task moved to ${columns.find((column) => column.id === status)!.title}.`);
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editor) return;
    const form = new FormData(event.currentTarget);
    const due = String(form.get("due") ?? "");
    const dueTime = String(form.get("dueTime") ?? "");
    if (dueTime && !due) {
      (event.currentTarget.elements.namedItem("due") as HTMLInputElement).setCustomValidity("Choose a due date for this time.");
      event.currentTarget.reportValidity();
      return;
    }
    const title = String(form.get("title") ?? "").trim();
    if (!title) {
      (event.currentTarget.elements.namedItem("title") as HTMLInputElement).setCustomValidity("Enter a task title.");
      event.currentTarget.reportValidity();
      return;
    }
    const task: Task = {
      id: editor.task?.id ?? crypto.randomUUID(), title,
      notes: String(form.get("notes") ?? "").trim(), status: String(form.get("status")) as Status,
      priority: String(form.get("priority")) as Task["priority"], due, dueTime,
    };
    const previous = editor.task;
    const next = { ...task, columnEnteredAt: previous && previous.status === task.status ? previous.columnEnteredAt : Date.now() };
    if (await persist(previous, next, previous ? "Task updated." : "Task created.")) setEditor(null);
  }

  // Older boards have no timestamps; their saved insertion order provides a fallback.
  const visible = tasks.filter((task) => `${task.title} ${task.notes}`.toLowerCase().includes(query.trim().toLowerCase()) && (!priority || task.priority === priority))
    .reverse().sort((a, b) => (b.columnEnteredAt ?? 0) - (a.columnEnteredAt ?? 0));
  const done = tasks.filter((task) => task.status === "done").length;
  const isOverdue = (task: Task) => task.status !== "done" && Boolean(task.due) && (task.dueTime
    ? new Date(`${task.due}T${task.dueTime}:00+08:00`).getTime() < now
    : task.due < today);

  return <section className="todo-page" aria-label="To-do board">
    <div className="card todo-toolbar">
      <div className="todo-summary"><span className="metric-icon lavender"><CheckCheck size={19} /></span><div><strong>{done} of {tasks.length} tasks complete</strong><p className="muted">{board.cloud ? board.error ? "Cloud sync unavailable" : !board.ready ? "Connecting to Supabase" : board.live ? "Live sync across devices" : "Saved in Supabase · Checking for updates" : "Demo · Saved in this browser"} · Drag cards or use the status menu.</p></div></div>
      <div className="table-controls">
        <label className="search todo-search"><Search size={15} /><input aria-label="Search tasks" placeholder="Search tasks…" value={query} onChange={(event) => { setQuery(event.target.value); setLimits(initialLimits); }} /></label>
        <select aria-label="Filter tasks by priority" value={priority} onChange={(event) => { setPriority(event.target.value); setLimits(initialLimits); }}><option value="">All priorities</option>{priorities.map((item) => <option key={item}>{item}</option>)}</select>
        <button className="button primary" disabled={saving || !board.ready} onClick={() => setEditor({ task: null, status: "todo" })}><Plus size={16} /> New task</button>
      </div>
    </div>
    {error && <div className="error-banner" role="alert">{error}<button className="button quiet" onClick={board.retry}>Retry</button></div>}
    {board.importWarning && <div className="error-banner" role="alert">{board.importWarning}<button className="button quiet" onClick={board.retry}>Retry import</button></div>}
    {board.loading && <p className="card empty" role="status">Loading your board…</p>}
    <p className="sr-only" role="status">{announcement}</p>
    <div className="kanban-board" aria-busy={saving || board.loading}>
      {columns.map(({ id, title, caption, icon: Icon }) => {
        const items = visible.filter((task) => task.status === id);
        return <section key={id} className={`kanban-column kanban-${id}${dragOver === id ? " drop-target" : ""}`} aria-label={`${title} tasks`}
          onDragOver={(event) => { if (dragging) { event.preventDefault(); event.dataTransfer.dropEffect = "move"; setDragOver(id); } }}
          onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragOver(null); }}
          onDrop={(event) => { event.preventDefault(); if (dragging) void move(dragging, id, Date.now()); setDragging(null); setDragOver(null); }}>
          <div className="kanban-heading"><h2><Icon size={16} />{title}<span>{items.length}</span></h2><button className="icon-button" aria-label={`Add task to ${title}`} disabled={saving || !board.ready} onClick={() => setEditor({ task: null, status: id })}><Plus size={16} /></button></div>
          <p className="kanban-caption">{caption}</p>
          <div className="kanban-cards">
            {items.slice(0, limits[id]).map((task) => <article key={task.id} className={`task-card${dragging === task.id ? " dragging" : ""}`} draggable
              onDragStart={(event) => { event.dataTransfer.setData("text/plain", task.id); event.dataTransfer.effectAllowed = "move"; setDragging(task.id); }}
              onDragEnd={() => { setDragging(null); setDragOver(null); }}>
              <div className="task-top"><span className={`task-priority priority-${task.priority.toLowerCase()}`}><i />{task.priority}</span><span className="task-grip" aria-hidden="true"><GripVertical size={15} /></span></div>
              <button className="task-title" onClick={() => setEditor({ task, status: task.status })}>{task.title}</button>
              {task.notes && <p className="task-notes">{task.notes}</p>}
              {task.due && <div className={`task-deadline${isOverdue(task) ? " overdue" : ""}`}>
                <p className="task-due"><CalendarDays size={13} />{formatDate(task.due, { day: "numeric", month: "short", year: "numeric" })}{isOverdue(task) ? " · Overdue" : ""}</p>
                {task.dueTime && <p className="task-due task-time"><Clock3 size={13} /><time dateTime={`${task.due}T${task.dueTime}:00+08:00`}>{new Intl.DateTimeFormat("en-MY", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Asia/Kuala_Lumpur" }).format(new Date(`${task.due}T${task.dueTime}:00+08:00`))}</time> MYT</p>}
              </div>}
              <div className="task-footer"><select aria-label={`Status for ${task.title}`} value={task.status} onChange={(event) => void move(task.id, event.target.value as Status, Date.now())}>{columns.map((column) => <option key={column.id} value={column.id}>{column.title}</option>)}</select><div className="task-actions"><button className="icon-button" aria-label={`Edit ${task.title}`} onClick={() => setEditor({ task, status: task.status })}><Pencil size={13} /></button><button className="icon-button" aria-label={`Delete ${task.title}`} onClick={() => setDeleting(task)}><Trash2 size={13} /></button></div></div>
            </article>)}
            {!items.length && <div className="kanban-empty"><Icon size={24} /><strong>{query || priority ? "No matching tasks" : "A little space for what’s next"}</strong><p>{query || priority ? "Try another search or priority." : `Add a task${id === "todo" ? " to get started" : " or move one here"}.`}</p></div>}
          </div>
          {items.length > pageSize && <div className="kanban-pagination">
            <p className="muted" role="status">Showing {Math.min(limits[id], items.length)} of {items.length} tasks</p>
            {items.length > limits[id] && <button className="button quiet" aria-label={`See more ${title} tasks`} onClick={() => setLimits((current) => ({ ...current, [id]: current[id] + pageSize }))}>See more ({items.length - limits[id]} remaining)</button>}
            {limits[id] > pageSize && <button className="text-button" aria-label={`Show fewer ${title} tasks`} onClick={() => setLimits((current) => ({ ...current, [id]: pageSize }))}>Show fewer</button>}
          </div>}
          <button className="kanban-add" disabled={saving || !board.ready} onClick={() => setEditor({ task: null, status: id })}><Plus size={15} /> Add task</button>
        </section>;
      })}
    </div>
    {editor && <Modal title={editor.task ? "Edit task" : "New task"} caption="Give your next step a little structure." onClose={() => setEditor(null)}>
      <form className="form-grid" onSubmit={save}>
        <label className="field full">Task title<input name="title" placeholder="e.g. Send the homepage draft" defaultValue={editor.task?.title ?? ""} maxLength={160} required autoFocus onChange={(event) => event.currentTarget.setCustomValidity("")} /></label>
        <label className="field full">Notes (optional)<textarea name="notes" rows={4} placeholder="Details, ideas or a quick checklist…" defaultValue={editor.task?.notes ?? ""} maxLength={3000} /></label>
        <label className="field">Status<select name="status" defaultValue={editor.status}>{columns.map((column) => <option key={column.id} value={column.id}>{column.title}</option>)}</select></label>
        <label className="field">Priority<select name="priority" defaultValue={editor.task?.priority ?? "Medium"}>{priorities.map((item) => <option key={item}>{item}</option>)}</select></label>
        <label className="field full">Due date (optional)<input name="due" type="date" defaultValue={editor.task?.due ?? ""} onChange={(event) => event.currentTarget.setCustomValidity("")} /></label>
        <label className="field full">Due time (optional, MYT)<input name="dueTime" type="time" defaultValue={editor.task?.dueTime ?? ""} onChange={(event) => (event.currentTarget.form!.elements.namedItem("due") as HTMLInputElement).setCustomValidity("")} /></label>
        {error && <p className="form-error full" role="alert">{error}</p>}
        <div className="modal-actions full"><button type="button" className="button quiet" onClick={() => setEditor(null)}>Cancel</button><button className="button primary" disabled={saving || !board.ready}>{saving ? "Saving…" : editor.task ? "Save changes" : "Create task"}</button></div>
      </form>
    </Modal>}
    {deleting && <Modal title="Delete task?" caption={`“${deleting.title}” will be permanently removed from this board.`} onClose={() => setDeleting(null)}>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="modal-actions"><button className="button quiet" onClick={() => setDeleting(null)}>Cancel</button><button className="button danger" disabled={saving || !board.ready} onClick={async () => { if (await persist(deleting, null, "Task deleted.")) setDeleting(null); }}>Delete task</button></div>
    </Modal>}
  </section>;
}
