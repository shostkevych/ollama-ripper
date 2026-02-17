import { Database } from "bun:sqlite";
import * as fs from "node:fs";
import * as path from "node:path";
import { storeDir } from "./store";
import { computeNextRun } from "./cron-parser";

export interface Schedule {
  id: number;
  prompt: string;
  schedule_expr: string;
  schedule_type: string;
  enabled: number;
  next_run: string;
  last_run: string | null;
  last_result: string | null;
  last_error: string | null;
  created_at: string;
}

let db: Database | null = null;

function getDb(): Database {
  if (db) return db;
  fs.mkdirSync(storeDir, { recursive: true });
  const dbPath = path.join(storeDir, "history.db");
  db = new Database(dbPath, { create: true });
  db.run("PRAGMA journal_mode = WAL");
  db.run(`
    CREATE TABLE IF NOT EXISTS schedules (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      prompt        TEXT NOT NULL,
      schedule_expr TEXT NOT NULL,
      schedule_type TEXT NOT NULL DEFAULT 'interval',
      enabled       INTEGER NOT NULL DEFAULT 1,
      next_run      TEXT NOT NULL,
      last_run      TEXT,
      last_result   TEXT,
      last_error    TEXT,
      created_at    TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  return db;
}

export function createSchedule(prompt: string, expr: string): Schedule {
  const d = getDb();
  const nextRun = computeNextRun(expr);
  if (!nextRun) throw new Error(`Invalid schedule expression: ${expr}`);
  const type = expr.trim().toLowerCase().startsWith("every") ? "interval" : "cron";
  d.run(
    "INSERT INTO schedules (prompt, schedule_expr, schedule_type, next_run) VALUES (?, ?, ?, ?)",
    [prompt, expr, type, nextRun]
  );
  const id = Number(d.query("SELECT last_insert_rowid() as id").get()!.id);
  return getSchedule(id)!;
}

export function listSchedules(): Schedule[] {
  return getDb().query("SELECT * FROM schedules ORDER BY id").all() as Schedule[];
}

export function listEnabledSchedules(): Schedule[] {
  return getDb().query("SELECT * FROM schedules WHERE enabled = 1 ORDER BY id").all() as Schedule[];
}

export function getSchedule(id: number): Schedule | null {
  return (getDb().query("SELECT * FROM schedules WHERE id = ?").get(id) as Schedule) ?? null;
}

export function removeSchedule(id: number): boolean {
  const result = getDb().run("DELETE FROM schedules WHERE id = ?", [id]);
  return result.changes > 0;
}

export function setScheduleEnabled(id: number, enabled: boolean): boolean {
  const result = getDb().run("UPDATE schedules SET enabled = ? WHERE id = ?", [enabled ? 1 : 0, id]);
  return result.changes > 0;
}

export function markRunStarted(id: number): void {
  getDb().run("UPDATE schedules SET last_run = datetime('now') WHERE id = ?", [id]);
}

export function markRunFinished(id: number, result: string | null, error: string | null, nextRun: string): void {
  getDb().run(
    "UPDATE schedules SET last_result = ?, last_error = ?, next_run = ? WHERE id = ?",
    [result ? result.slice(0, 4000) : null, error, nextRun, id]
  );
}
