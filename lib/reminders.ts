export type ReminderSettings = { enabled: boolean; daysBefore: number; repeatHours: number; time: string };
export type CustomReminder = { id: string; title: string; date: string; time: string; completed: boolean; settings?: ReminderSettings };
export type ReminderItem = { id: string; title: string; date: string; time?: string; source: "Project" | "To-do" | "Custom"; projectId?: string; settings?: ReminderSettings };
export type ReminderData = { settings: ReminderSettings; custom: CustomReminder[]; acknowledged: Record<string, number>; notified: Record<string, number> };
export const defaultReminderSettings: ReminderSettings = { enabled: true, daysBefore: 3, repeatHours: 24, time: "09:00" };
export const emptyReminderData = (): ReminderData => ({ settings: { ...defaultReminderSettings }, custom: [], acknowledged: {}, notified: {} });
export const validTime = (value: unknown): value is string => typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
export function validDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
export function validSettings(value: unknown): value is ReminderSettings {
  if (!value || typeof value !== "object") return false;
  const settings = value as ReminderSettings;
  return typeof settings.enabled === "boolean" && Number.isInteger(settings.daysBefore) && settings.daysBefore >= 0 && settings.daysBefore <= 365
    && Number.isInteger(settings.repeatHours) && settings.repeatHours >= 0 && settings.repeatHours <= 8760 && validTime(settings.time);
}
export function parseReminderData(raw: string | null): ReminderData {
  if (!raw) return emptyReminderData();
  const data = JSON.parse(raw) as ReminderData;
  const validRecord = (value: unknown) => value && typeof value === "object" && !Array.isArray(value)
    && Object.values(value).every((stamp) => typeof stamp === "number" && Number.isFinite(stamp) && stamp >= 0);
  if (!data || !validSettings(data.settings) || !Array.isArray(data.custom) || !data.custom.every((item) => item && typeof item.id === "string" && item.id.length > 0
    && typeof item.title === "string" && item.title.trim().length > 0 && item.title.length <= 120 && validDate(item.date) && validTime(item.time)
    && typeof item.completed === "boolean" && (item.settings === undefined || validSettings(item.settings)))
    || new Set(data.custom.map((item) => item.id)).size !== data.custom.length || !validRecord(data.acknowledged) || !validRecord(data.notified)) {
    throw new Error("Couldn’t read saved reminders. Your saved data has been kept.");
  }
  return data;
}

export function reminderSchedule(item: ReminderItem, defaults: ReminderSettings, now: number) {
  const settings = item.settings ?? defaults;
  if (!defaults.enabled || !settings.enabled || !validSettings(settings) || !validDate(item.date) || (item.time !== undefined && !validTime(item.time))) return null;
  const time = item.time ?? settings.time;
  const dueAt = new Date(`${item.date}T${time}:00+08:00`).getTime();
  const firstAt = dueAt - settings.daysBefore * 86400000;
  const interval = settings.repeatHours * 3600000;
  const key = `${item.id}|${item.date}|${time}|${settings.daysBefore}|${settings.repeatHours}`;
  if (now < firstAt) return { key, dueAt, currentAt: null, nextAt: firstAt };
  const currentAt = interval ? firstAt + Math.floor((now - firstAt) / interval) * interval : firstAt;
  return { key, dueAt, currentAt, nextAt: interval ? currentAt + interval : null };
}

export function taskReminderItems(raw: string | null): ReminderItem[] {
  const tasks: unknown = JSON.parse(raw ?? "[]");
  if (!Array.isArray(tasks)) throw new Error("Couldn’t read to-do deadlines.");
  return tasks.flatMap((task) => task && typeof task.id === "string" && typeof task.title === "string" && ["todo", "progress"].includes(task.status) && validDate(task.due)
    && (!task.dueTime || validTime(task.dueTime))
    ? [{ id: `task-${task.id}`, title: task.title, date: task.due, time: task.dueTime || undefined, source: "To-do" as const }] : []);
}
