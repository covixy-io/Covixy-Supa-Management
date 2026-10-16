import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import path from "node:path";

const globalDb = globalThis as unknown as { __csmDb?: DatabaseSync; __csmDbPath?: string };

export function dbFilePath(): string {
  return process.env.PANEL_DB_PATH || path.join(process.cwd(), "data", "panel.db");
}

export function panelDataDir(): string {
  const file = dbFilePath();
  return file === ":memory:" ? path.join(process.cwd(), "data") : path.dirname(file);
}

function migrate(database: DatabaseSync): void {
  database.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL,
      api_host TEXT NOT NULL,
      studio_host TEXT NOT NULL,
      template_id TEXT NOT NULL,
      template_version TEXT NOT NULL,
      postgres_major INTEGER NOT NULL,
      coolify_service_uuid TEXT,
      ram_mb INTEGER NOT NULL,
      error TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS secrets (
      project_id TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
      ciphertext TEXT NOT NULL,
      nonce TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY,
      project_id TEXT,
      project_slug TEXT NOT NULL,
      type TEXT NOT NULL,
      status TEXT NOT NULL,
      log TEXT NOT NULL DEFAULT '',
      error TEXT,
      created_at TEXT NOT NULL,
      started_at TEXT,
      finished_at TEXT
    );

    CREATE INDEX IF NOT EXISTS jobs_status_created ON jobs (status, created_at);

    CREATE TABLE IF NOT EXISTS audit (
      id TEXT PRIMARY KEY,
      at TEXT NOT NULL,
      action TEXT NOT NULL,
      project_id TEXT,
      project_slug TEXT NOT NULL,
      detail TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS project_env (
      project_id TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
      ciphertext TEXT NOT NULL,
      nonce TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS panel_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS load_samples (
      id TEXT PRIMARY KEY,
      at TEXT NOT NULL,
      used_mb INTEGER NOT NULL,
      available_mb INTEGER NOT NULL,
      active_stacks INTEGER NOT NULL
    );
  `);
  const columns = database.prepare("PRAGMA table_info(projects)").all() as { name: string }[];
  const names = new Set(columns.map((column) => column.name));
  if (!names.has("url_scheme")) database.exec("ALTER TABLE projects ADD COLUMN url_scheme TEXT NOT NULL DEFAULT 'https'");
  if (!names.has("custom_domain")) database.exec("ALTER TABLE projects ADD COLUMN custom_domain TEXT");
  if (!names.has("panel_host")) database.exec("ALTER TABLE projects ADD COLUMN panel_host TEXT");
  if (!names.has("keys_local")) database.exec("ALTER TABLE projects ADD COLUMN keys_local INTEGER NOT NULL DEFAULT 1");
}

export function getDb(): DatabaseSync {
  const file = dbFilePath();
  if (!globalDb.__csmDb || globalDb.__csmDbPath !== file) {
    if (globalDb.__csmDb) globalDb.__csmDb.close();
    if (file !== ":memory:") mkdirSync(path.dirname(file), { recursive: true });
    globalDb.__csmDb = new DatabaseSync(file);
    globalDb.__csmDbPath = file;
  }
  migrate(globalDb.__csmDb);
  return globalDb.__csmDb;
}

export function resetDbForTests(): void {
  if (globalDb.__csmDb) globalDb.__csmDb.close();
  globalDb.__csmDb = undefined;
  globalDb.__csmDbPath = undefined;
}
