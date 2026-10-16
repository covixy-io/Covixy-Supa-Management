import { writeFileSync } from "node:fs";
import { Client } from "pg";
import {
  authTableNames,
  parseDatabaseUrl,
  plainRow,
  renderRestoreSql,
  storageTableNames,
  type RestoreTable,
} from "@/lib/restore-sql";

export async function writeCloudRestore(connectionString: string, destination: string): Promise<{ users: number; tables: number }> {
  const parsed = parseDatabaseUrl(connectionString);
  const client = new Client({
    connectionString: parsed.connectionString,
    ssl: parsed.ssl ? { rejectUnauthorized: false } : undefined,
    connectionTimeoutMillis: 20_000,
    statement_timeout: 0,
  });
  await client.connect();
  try {
    const tables: RestoreTable[] = [];
    for (const name of authTableNames()) {
      const rows = await readRows(client, "auth", name);
      if (rows) tables.push({ schema: "auth", name, createSql: null, rows });
    }
    for (const name of storageTableNames()) {
      const rows = await readRows(client, "storage", name);
      if (rows) tables.push({ schema: "storage", name, createSql: null, rows });
    }
    const created = await readPublicTables(client);
    tables.push(...created);
    const policies = await readPolicies(client);
    const functions = await readFunctions(client);
    writeFileSync(destination, renderRestoreSql({ tables, policies, functions }), { mode: 0o600 });
    const users = tables.find((table) => table.schema === "auth" && table.name === "users")?.rows.length || 0;
    return { users, tables: created.length };
  } finally {
    await client.end();
  }
}

async function readRows(client: Client, schema: "auth" | "storage", name: string): Promise<Record<string, unknown>[] | null> {
  const found = await client.query<{ name: string | null }>("SELECT to_regclass($1) AS name", [`${schema}.${name}`]);
  if (!found.rows[0]?.name) return null;
  const result = await client.query<Record<string, unknown>>(`SELECT * FROM "${schema}"."${name}"`);
  return result.rows.map((row) => plainRow(row));
}

async function readPublicTables(client: Client): Promise<RestoreTable[]> {
  const listed = await client.query<{ relname: string }>(
    `SELECT c.relname
     FROM pg_class c
     JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relispartition
     ORDER BY c.relname`,
  );
  const tables: RestoreTable[] = [];
  for (const { relname } of listed.rows) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(relname)) continue;
    const createSql = await createTableSql(client, relname);
    const result = await client.query<Record<string, unknown>>(`SELECT * FROM "public"."${relname}"`);
    tables.push({
      schema: "public",
      name: relname,
      createSql,
      rows: result.rows.map((row) => plainRow(row)),
    });
  }
  return tables;
}

async function createTableSql(client: Client, name: string): Promise<string> {
  const columns = await client.query<{
    attname: string;
    typ: string;
    notnull: boolean;
    default_expr: string | null;
    generated: string;
  }>(
    `SELECT a.attname,
            format_type(a.atttypid, a.atttypmod) AS typ,
            a.attnotnull AS notnull,
            pg_get_expr(ad.adbin, ad.adrelid) AS default_expr,
            a.attgenerated AS generated
     FROM pg_attribute a
     JOIN pg_class c ON c.oid = a.attrelid
     JOIN pg_namespace n ON n.oid = c.relnamespace
     LEFT JOIN pg_attrdef ad ON ad.adrelid = a.attrelid AND ad.adnum = a.attnum
     WHERE n.nspname = 'public' AND c.relname = $1 AND a.attnum > 0 AND NOT a.attisdropped
     ORDER BY a.attnum`,
    [name],
  );
  const constraints = await client.query<{ def: string }>(
    `SELECT pg_get_constraintdef(oid) AS def
     FROM pg_constraint
     WHERE conrelid = $1::regclass AND contype IN ('p', 'u', 'f')
     ORDER BY contype, conname`,
    [`public.${name}`],
  );
  const body = [
    ...columns.rows
      .filter((column) => column.generated !== "s")
      .map((column) => {
        const nullable = column.notnull ? " NOT NULL" : "";
        const fallback = column.default_expr ? ` DEFAULT ${column.default_expr}` : "";
        return `"${column.attname}" ${column.typ}${nullable}${fallback}`;
      }),
    ...constraints.rows.map((row) => row.def),
  ];
  return `CREATE TABLE IF NOT EXISTS "public"."${name}" (\n  ${body.join(",\n  ")}\n);`;
}

async function readPolicies(client: Client): Promise<string[]> {
  const enabled = await client.query<{ relname: string }>(
    `SELECT c.relname
     FROM pg_class c
     JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relrowsecurity`,
  );
  const policies = await client.query<{
    tablename: string;
    policyname: string;
    permissive: string;
    roles: string[];
    cmd: string;
    qual: string | null;
    with_check: string | null;
  }>("SELECT tablename, policyname, permissive, roles, cmd, qual, with_check FROM pg_policies WHERE schemaname = 'public'");
  const statements = enabled.rows
    .filter((row) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(row.relname))
    .map((row) => `ALTER TABLE "public"."${row.relname}" ENABLE ROW LEVEL SECURITY`);
  for (const policy of policies.rows) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(policy.tablename)) continue;
    const roles = (policy.roles || []).map((role) => `"${role}"`).join(", ") || "PUBLIC";
    const using = policy.qual ? ` USING (${policy.qual})` : "";
    const check = policy.with_check ? ` WITH CHECK (${policy.with_check})` : "";
    statements.push(
      `CREATE POLICY "${policy.policyname.replace(/"/g, '""')}" ON "public"."${policy.tablename}" AS ${policy.permissive} FOR ${policy.cmd} TO ${roles}${using}${check}`,
    );
  }
  return statements;
}

async function readFunctions(client: Client): Promise<string[]> {
  const result = await client.query<{ def: string }>(
    `SELECT pg_get_functiondef(p.oid) AS def
     FROM pg_proc p
     JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e')`,
  );
  return result.rows.map((row) => row.def);
}
