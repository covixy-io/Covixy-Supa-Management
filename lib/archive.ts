import type { EnvVar } from "@/lib/compose";
import type { StackSecrets } from "@/lib/secrets";
import { parseScheme, type UrlScheme } from "@/lib/urls";

export const ARCHIVE_FORMAT = "covixy-supa-offline";

export type ProjectArchive = {
  format: typeof ARCHIVE_FORMAT;
  version: 1;
  exportedAt: string;
  name: string;
  slug: string;
  postgresMajor: number;
  scheme: UrlScheme;
  customDomain: string | null;
  panelHost: string | null;
  env: Record<string, EnvVar>;
};

const REQUIRED_ENV = [
  "JWT_SECRET",
  "ANON_KEY",
  "SERVICE_ROLE_KEY",
  "POSTGRES_PASSWORD",
  "SECRET_KEY_BASE",
  "PG_META_CRYPTO_KEY",
  "REALTIME_DB_ENC_KEY",
  "DASHBOARD_USERNAME",
  "DASHBOARD_PASSWORD",
  "S3_PROTOCOL_ACCESS_KEY_ID",
  "S3_PROTOCOL_ACCESS_KEY_SECRET",
] as const;

export function parseArchive(input: unknown): ProjectArchive {
  if (!input || typeof input !== "object") throw new Error("That file is not a Covixy offline project.");
  const row = input as Record<string, unknown>;
  if (row.format !== ARCHIVE_FORMAT || row.version !== 1) {
    throw new Error("This file is not a Covixy offline project, or this panel is too old to read it.");
  }
  const name = typeof row.name === "string" ? row.name.trim().replace(/\s+/g, " ") : "";
  const slug = typeof row.slug === "string" ? row.slug.trim().toLowerCase() : "";
  if (name.length < 1 || name.length > 80) throw new Error("The offline file is missing a project name.");
  if (!slug) throw new Error("The offline file is missing a slug.");
  const envInput = row.env;
  if (!envInput || typeof envInput !== "object" || Array.isArray(envInput)) {
    throw new Error("The offline file has no environment.");
  }
  const env: Record<string, EnvVar> = {};
  for (const [key, item] of Object.entries(envInput as Record<string, unknown>)) {
    if (!/^[A-Z][A-Z0-9_]*$/.test(key)) throw new Error(`The offline file has a bad variable name: ${key}.`);
    if (!item || typeof item !== "object") throw new Error(`The offline file has a bad value for ${key}.`);
    const value = (item as { value?: unknown }).value;
    if (typeof value !== "string" || value.length > 8000) throw new Error(`The offline file has a bad value for ${key}.`);
    env[key] = { value, secret: Boolean((item as { secret?: unknown }).secret) };
  }
  for (const key of REQUIRED_ENV) {
    if (!env[key]?.value) throw new Error(`The offline file is missing ${key}.`);
  }
  const postgresMajor = Number(row.postgresMajor);
  return {
    format: ARCHIVE_FORMAT,
    version: 1,
    exportedAt: typeof row.exportedAt === "string" ? row.exportedAt : "",
    name,
    slug,
    postgresMajor: Number.isFinite(postgresMajor) ? postgresMajor : 0,
    scheme: parseScheme(typeof row.scheme === "string" ? row.scheme : "https"),
    customDomain: typeof row.customDomain === "string" ? row.customDomain : null,
    panelHost: typeof row.panelHost === "string" ? row.panelHost : null,
    env,
  };
}

export function secretsFromEnv(env: Record<string, EnvVar>): StackSecrets {
  return {
    jwtSecret: env.JWT_SECRET.value,
    anonKey: env.ANON_KEY.value,
    serviceRoleKey: env.SERVICE_ROLE_KEY.value,
    postgresPassword: env.POSTGRES_PASSWORD.value,
    secretKeyBase: env.SECRET_KEY_BASE.value,
    pgMetaCryptoKey: env.PG_META_CRYPTO_KEY.value,
    realtimeDbEncKey: env.REALTIME_DB_ENC_KEY.value,
    dashboardUsername: env.DASHBOARD_USERNAME.value,
    dashboardPassword: env.DASHBOARD_PASSWORD.value,
    s3ProtocolAccessKeyId: env.S3_PROTOCOL_ACCESS_KEY_ID.value,
    s3ProtocolAccessKeySecret: env.S3_PROTOCOL_ACCESS_KEY_SECRET.value,
  };
}

export function retargetArchiveEnv(env: Record<string, EnvVar>, input: { name: string; slug: string; apiUrl: string }): Record<string, EnvVar> {
  const next: Record<string, EnvVar> = { ...env };
  const plain = (key: string, value: string) => {
    if (next[key]) next[key] = { ...next[key], value };
  };
  plain("API_EXTERNAL_URL", input.apiUrl);
  plain("SUPABASE_PUBLIC_URL", input.apiUrl);
  plain("SITE_URL", input.apiUrl);
  plain("STORAGE_TENANT_ID", input.slug);
  plain("STUDIO_DEFAULT_PROJECT", input.name);
  const host = input.apiUrl.replace(/^https?:\/\//, "");
  if (next.SMTP_ADMIN_EMAIL) next.SMTP_ADMIN_EMAIL = { ...next.SMTP_ADMIN_EMAIL, value: `noreply@${host}` };
  return next;
}
