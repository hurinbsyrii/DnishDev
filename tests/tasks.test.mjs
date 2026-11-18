import assert from "node:assert/strict";
import test from "node:test";
import { parseTasks, taskFromRow, taskRow } from "../lib/tasks.ts";
const task = { id: "legacy-task", title: "Send draft", notes: "Details", status: "progress", priority: "High", due: "2026-11-20", dueTime: "15:30" };
test("preserves legacy browser tasks and dates during cloud conversion", () => {
  const parsed = parseTasks(JSON.stringify([task]));
  const row = taskRow(parsed[0], 12);
  assert.equal(row.due_time, "15:30");
  assert.equal(row.column_entered_at, 12);
  assert.deepEqual(taskFromRow({ ...row, version: 7 }), { ...task, columnEnteredAt: 12, version: 7 });
});
test("optional dates and ordering survive loading and saving", () => {
  const row = taskRow({ ...task, due: "", dueTime: "", columnEnteredAt: 300 });
  assert.equal(row.due, null);
  assert.equal(row.due_time, null);
  assert.equal(row.column_entered_at, 300);
  assert.equal(taskFromRow({ ...row, version: 1 }).due, "");
});
test("does not send UI versions as client-controlled database updates", () => {
  assert.equal("version" in taskRow({ ...task, version: 200 }), false);
  assert.equal("user_id" in taskRow(task), false);
});
test("corrupted and duplicate legacy tasks are rejected without dropping records", () => {
  assert.deepEqual(parseTasks(null), []);
  for (const raw of ["{}", "invalid", JSON.stringify([task, task]), JSON.stringify([{ ...task, status: "bad" }]), JSON.stringify([{ ...task, dueTime: "25:00" }])]) assert.throws(() => parseTasks(raw));
});
