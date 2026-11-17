import assert from "node:assert/strict";
import test from "node:test";
import { defaultReminderSettings, emptyReminderData, parseReminderData, reminderSchedule, taskReminderItems, validSettings } from "../lib/reminders.ts";
const item = { id: "project-one", title: "Launch", date: "2026-11-20", source: "Project" };
const at = (date) => new Date(date).getTime();

test("defaults start three days before at 9am Malaysia time and repeat daily", () => {
  const before = reminderSchedule(item, defaultReminderSettings, at("2026-11-16T23:00:00Z"));
  assert.equal(before.currentAt, null);
  assert.equal(before.nextAt, at("2026-11-17T01:00:00Z"));
  const first = reminderSchedule(item, defaultReminderSettings, before.nextAt);
  assert.equal(first.currentAt, before.nextAt);
  assert.equal(first.nextAt, at("2026-11-18T01:00:00Z"));
});

test("custom lead time, frequency, and due time respect MYT across month boundaries", () => {
  const result = reminderSchedule({ ...item, date: "2027-01-01", time: "00:30" }, { ...defaultReminderSettings, daysBefore: 5, repeatHours: 6 }, at("2026-12-27T23:00:00Z"));
  assert.equal(result.currentAt, at("2026-12-27T22:30:00Z"));
  assert.equal(result.nextAt, at("2026-12-28T04:30:00Z"));
});

test("once-only reminder stays a single occurrence when reopening much later", () => {
  const result = reminderSchedule(item, { ...defaultReminderSettings, daysBefore: 0, repeatHours: 0 }, at("2026-12-01T00:00:00Z"));
  assert.equal(result.currentAt, at("2026-11-20T01:00:00Z"));
  assert.equal(result.nextAt, null);
});

test("missed recurring reminders catch up to one current interval", () => {
  const result = reminderSchedule(item, defaultReminderSettings, at("2026-11-23T10:00:00Z"));
  assert.equal(result.currentAt, at("2026-11-23T01:00:00Z"));
  assert.equal(result.nextAt, at("2026-11-24T01:00:00Z"));
});

test("custom schedules override defaults but global pause disables every reminder", () => {
  const custom = { ...item, settings: { ...defaultReminderSettings, daysBefore: 1, repeatHours: 48 } };
  assert.equal(reminderSchedule(custom, defaultReminderSettings, at("2026-11-17T01:00:00Z")).nextAt, at("2026-11-19T01:00:00Z"));
  assert.equal(reminderSchedule(custom, { ...defaultReminderSettings, enabled: false }, Date.now()), null);
});

test("acknowledgements are scoped to deadline and settings, and expire next interval", () => {
  const first = reminderSchedule(item, defaultReminderSettings, at("2026-11-17T01:00:00Z"));
  const acknowledged = { [first.key]: first.currentAt };
  assert.equal(acknowledged[first.key] >= first.currentAt, true);
  const next = reminderSchedule(item, defaultReminderSettings, at("2026-11-18T01:00:00Z"));
  assert.equal(acknowledged[next.key] >= next.currentAt, false);
  assert.notEqual(reminderSchedule({ ...item, date: "2026-11-21" }, defaultReminderSettings, Date.now()).key, first.key);
  assert.notEqual(reminderSchedule(item, { ...defaultReminderSettings, repeatHours: 48 }, Date.now()).key, first.key);
});

test("stored preferences and custom reminders round-trip; corrupted data is rejected", () => {
  const data = emptyReminderData();
  assert.equal(data.settings.daysBefore, 3);
  data.custom.push({ id: "one", title: "Follow up", date: "2026-11-20", time: "10:00", completed: false });
  assert.deepEqual(parseReminderData(JSON.stringify(data)), data);
  for (const settings of [{ ...data.settings, daysBefore: -1 }, { ...data.settings, repeatHours: 0.5 }, { ...data.settings, time: "25:00" }]) {
    assert.equal(validSettings(settings), false);
    assert.throws(() => parseReminderData(JSON.stringify({ ...data, settings })));
  }
  assert.throws(() => parseReminderData("not-json"));
  assert.throws(() => parseReminderData(JSON.stringify({ ...data, custom: [{ ...data.custom[0], date: "2026-02-30" }] })));
  assert.throws(() => parseReminderData(JSON.stringify({ ...data, custom: [data.custom[0], data.custom[0]] })));
});

test("only active to-dos with valid deadlines create reminders", () => {
  const task = { id: "one", title: "Send draft", status: "todo", due: "2026-11-20", dueTime: "15:30" };
  const result = taskReminderItems(JSON.stringify([task, { ...task, id: "done", status: "done" }, { ...task, id: "no-date", due: "" }]));
  assert.equal(result.length, 1);
  assert.equal(result[0].time, "15:30");
  assert.equal(result[0].source, "To-do");
  assert.throws(() => taskReminderItems("{}"));
});
