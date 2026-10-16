import { createHmac, timingSafeEqual } from "node:crypto";
import { decodeJwtPayload } from "@/lib/secrets";

export type RestoreTable = {
  schema: "auth" | "storage" | "public";
  name: string;
  createSql: string | null;
  rows: Record<string, unknown>[];
};

const AUTH_TABLES = ["users", "identities", "mfa_factors", "mfa_amr_claims", "sessions", "refresh_tokens"] as const;
const STORAGE_TABLES = ["buckets", "objects"] as const;

export function authTableNames(): readonly string[] {
  return AUTH_TABLES;
}

export function storageTableNames(): readonly string[] {
  return STORAGE_TABLES;
}

export function parseDatabaseUrl(value: string): { connectionString: string; ssl: boolean } {
  const trimmed = value.trim();
  if (!/^postgres(ql)?:\/\//i.test(trimmed)) {
    throw new Error("Paste the Postgres connection string from Supabase Connect.");
  }
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new Error("That connection string could not be read.");
  }
  const port = url.port || "5432";
  if (port === "6543") {
    throw new Error("Use the session pooler or the direct connection on port 5432. Port 6543 cannot copy the database.");
  }
  const ssl = url.hostname.endsWith("supabase.co") || url.searchParams.get("sslmode") === "require";
  return { connectionString: trimmed, ssl };
}

export function assertCloudKeys(jwtSecret: string, anonKey: string, serviceRoleKey: string): void {
  const secret = jwtSecret.trim();
  const anon = anonKey.trim();
  const service = serviceRoleKey.trim();
  if (secret.length < 16) throw new Error("Paste the JWT secret from the Supabase API settings.");
  if (decodeJwtPayload(anon).role !== "anon") throw new Error("That anon key is not an anon key.");
  if (decodeJwtPayload(service).role !== "service_role") throw new Error("That service role key is not a service_role key.");
  if (!jwtSignedBy(anon, secret)) throw new Error("The anon key was not signed by that JWT secret.");
  if (!jwtSignedBy(service, secret)) throw new Error("The service role key was not signed by that JWT secret.");
}

function jwtSignedBy(token: string, secret: string): boolean {
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  const expected = createHmac("sha256", secret).update(`${parts[0]}.${parts[1]}`).digest();
  let actual: Buffer;
  try {
    actual = Buffer.from(parts[2], "base64url");
  } catch {
    return false;
  }
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}

function quoteJson(value: unknown): string {
  const text = JSON.stringify(value);
  let tag = "csm";
  while (text.includes(`$${tag}$`) || text.includes("$body$")) tag += "x";
  return `$${tag}$${text}$${tag}$`;
}

function sqlTextArray(values: string[]): string {
  return `ARRAY[${values.map((value) => `'${value.replace(/'/g, "''")}'`).join(", ")}]::text[]`;
}

function columnList(rows: Record<string, unknown>[]): string[] {
  const keys = new Set<string>();
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) keys.add(key);
    }
  }
  return [...keys];
}

export function renderRestoreSql(input: {
  tables: RestoreTable[];
  functions: string[];
  policies: string[];
}): string {
  const lines = [
    "SET session_replication_role = replica;",
    "SET statement_timeout = 0;",
  ];
  for (const table of input.tables) {
    if (table.createSql) lines.push(table.createSql);
    if (!table.rows.length) continue;
    const columns = columnList(table.rows);
    if (!columns.length) continue;
    const columnSql = columns.map((column) => `"${column}"`).join(", ");
    const qualified = `"${table.schema}"."${table.name}"`;
    for (let index = 0; index < table.rows.length; index += 200) {
      const batch = table.rows.slice(index, index + 200).map(plainRow);
      if (table.schema === "public") {
        lines.push(
          `INSERT INTO ${qualified} (${columnSql}) SELECT ${columnSql} FROM json_populate_recordset(NULL::${qualified}, ${quoteJson(batch)}::json) ON CONFLICT DO NOTHING;`,
        );
        continue;
      }
      lines.push(`DO $body$
DECLARE cols text;
BEGIN
  IF to_regclass('${table.schema}.${table.name}') IS NULL THEN
    RETURN;
  END IF;
  SELECT string_agg(quote_ident(column_name), ', ' ORDER BY ordinal_position)
    INTO cols
  FROM information_schema.columns
  WHERE table_schema = '${table.schema}'
    AND table_name = '${table.name}'
    AND column_name = ANY (${sqlTextArray(columns)});
  IF cols IS NULL THEN
    RETURN;
  END IF;
  EXECUTE format(
    'INSERT INTO ${qualified} (%s) SELECT %s FROM json_populate_recordset(NULL::${qualified}, %L::json) ON CONFLICT DO NOTHING',
    cols,
    cols,
    ${quoteJson(batch)}
  );
END
$body$;`);
    }
  }
  lines.push(`DO $body$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT n.nspname AS schema, c.relname AS table, a.attname AS column,
           pg_get_serial_sequence(format('%I.%I', n.nspname, c.relname), a.attname) AS seq
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
    WHERE n.nspname = 'public' AND c.relkind = 'r' AND a.attidentity <> ''
  LOOP
    IF r.seq IS NOT NULL THEN
      EXECUTE format('SELECT setval(%L, COALESCE((SELECT MAX(%I) FROM %I.%I), 1), true)', r.seq, r.column, r.schema, r.table);
    END IF;
  END LOOP;
END
$body$;`);
  for (const statement of [...input.policies, ...input.functions]) {
    lines.push(`DO $body$
BEGIN
  EXECUTE ${quoteJson(statement)};
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'skipped restore statement';
END
$body$;`);
  }
  lines.push(
    "GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;",
    "GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;",
    "GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;",
    "GRANT ALL ON ALL TABLES IN SCHEMA auth TO supabase_auth_admin;",
    "GRANT ALL ON ALL SEQUENCES IN SCHEMA auth TO supabase_auth_admin;",
    "SET session_replication_role = origin;",
  );
  return lines.join("\n");
}

export function plainRow(row: Record<string, unknown>): Record<string, unknown> {
  const next: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) next[key] = plainValue(value);
  return next;
}

function plainValue(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (typeof Buffer !== "undefined" && Buffer.isBuffer(value)) return `\\x${value.toString("hex")}`;
  if (Array.isArray(value)) return value.map((item) => plainValue(item));
  if (value && typeof value === "object") {
    const next: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) next[key] = plainValue(item);
    return next;
  }
  return value;
}
