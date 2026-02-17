import { Database } from "bun:sqlite";
import * as fs from "node:fs";
import * as path from "node:path";
import { storeDir } from "./store";

export interface Conversation {
  id: number;
  title: string;
  summary: string;
  model: string;
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
    CREATE TABLE IF NOT EXISTS conversations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      summary TEXT NOT NULL,
      model TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  return db;
}

export function saveConversation(title: string, summary: string, model: string): number {
  const d = getDb();
  const result = d.run(
    "INSERT INTO conversations (title, summary, model) VALUES (?, ?, ?)",
    [title, summary, model]
  );
  return Number(result.lastInsertRowid);
}

export function listConversations(): Conversation[] {
  const d = getDb();
  return d.query("SELECT * FROM conversations ORDER BY created_at DESC").all() as Conversation[];
}

export function getConversation(id: number): Conversation | null {
  const d = getDb();
  return (d.query("SELECT * FROM conversations WHERE id = ?").get(id) as Conversation) ?? null;
}
