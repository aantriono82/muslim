import { Database } from "bun:sqlite";
import { join, resolve } from "path";

// Samakan dengan api/scripts/backup-db.ts & restore-db.ts: DB_PATH env > default.
export const dbPath = resolve(
  process.env.DB_PATH ?? join(import.meta.dir, "../data.sqlite"),
);

export const db = new Database(dbPath, { create: true });

db.exec("PRAGMA journal_mode = WAL;");
db.exec("PRAGMA foreign_keys = ON;");

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`);
