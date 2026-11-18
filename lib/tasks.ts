export const priorities = ["Low", "Medium", "High"] as const;
export type TaskStatus = "todo" | "progress" | "done";
export type Task = { id: string; title: string; notes: string; status: TaskStatus; priority: typeof priorities[number]; due: string; dueTime?: string; columnEnteredAt?: number; version?: number };
export type TaskRow = { id: string; title: string; notes: string; status: TaskStatus; priority: Task["priority"]; due: string | null; due_time: string | null; column_entered_at: number; version: number };

export function parseTasks(raw: string | null): Task[] {
  const stored: unknown = JSON.parse(raw ?? "[]");
  if (!Array.isArray(stored) || !stored.every((task) => task && typeof task.id === "string" && task.id.length > 0 && task.id.length <= 120
    && typeof task.title === "string" && task.title.trim().length > 0 && task.title.length <= 160
    && typeof task.notes === "string" && task.notes.length <= 3000 && ["todo", "progress", "done"].includes(task.status)
    && priorities.includes(task.priority) && typeof task.due === "string"
    && (task.columnEnteredAt === undefined || (Number.isSafeInteger(task.columnEnteredAt) && task.columnEnteredAt >= 0))
    && (task.dueTime === undefined || task.dueTime === "" || (typeof task.dueTime === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(task.dueTime))))) {
    throw new Error("Couldn’t read the saved board. Your saved data has been kept.");
  }
  if (new Set(stored.map((task) => task.id)).size !== stored.length) throw new Error("The saved board has duplicate task IDs. Your saved data has been kept.");
  return stored;
}
export function taskRow(task: Task, fallback = 0) {
  return { id: task.id, title: task.title, notes: task.notes, status: task.status, priority: task.priority,
    due: task.due || null, due_time: task.dueTime || null, column_entered_at: task.columnEnteredAt ?? fallback };
}
export function taskFromRow(row: TaskRow): Task {
  return { id: row.id, title: row.title, notes: row.notes, status: row.status, priority: row.priority,
    due: row.due ?? "", dueTime: row.due_time ?? "", columnEnteredAt: Number(row.column_entered_at), version: row.version };
}
