import { Database } from "bun:sqlite";
import * as fs from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";
import { storeDir } from "./store";

let db: Database | null = null;

function getDb(): Database {
  if (db) return db;
  fs.mkdirSync(storeDir, { recursive: true });
  const dbPath = path.join(storeDir, "history.db");
  db = new Database(dbPath, { create: true });
  db.run("PRAGMA journal_mode = WAL");
  db.run(`
    CREATE TABLE IF NOT EXISTS auth_tokens (
      token TEXT PRIMARY KEY,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      last_used TEXT
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS pairing_codes (
      code TEXT PRIMARY KEY,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  return db;
}

export function generatePairingCode(): string {
  const code = String(Math.floor(100000 + Math.random() * 900000));
  const d = getDb();
  // Clean expired codes (older than 5 minutes)
  d.run("DELETE FROM pairing_codes WHERE datetime(created_at, '+5 minutes') < datetime('now')");
  d.run("INSERT INTO pairing_codes (code) VALUES (?)", [code]);
  return code;
}

export function verifyPairingCode(code: string): string | null {
  const d = getDb();
  const row = d.query(
    "SELECT code FROM pairing_codes WHERE code = ? AND datetime(created_at, '+5 minutes') > datetime('now')"
  ).get(code) as { code: string } | null;
  if (!row) return null;
  d.run("DELETE FROM pairing_codes WHERE code = ?", [code]);
  const token = `sk-ol-${crypto.randomBytes(32).toString("hex")}`;
  d.run("INSERT INTO auth_tokens (token) VALUES (?)", [token]);
  return token;
}

export function validateToken(token: string): boolean {
  const d = getDb();
  const row = d.query("SELECT token FROM auth_tokens WHERE token = ?").get(token);
  if (row) {
    d.run("UPDATE auth_tokens SET last_used = datetime('now') WHERE token = ?", [token]);
    return true;
  }
  return false;
}
