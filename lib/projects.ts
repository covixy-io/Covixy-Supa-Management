import { randomUUID } from "node:crypto";
import { getDb } from "@/lib/db";
import { decryptJson, encryptJson } from "@/lib/crypto";
import { hostsFor, validateApex, validateSlug } from "@/lib/hosts";
import { applyAddressEnv, parseScheme, resolveAddressInput } from "@/lib/urls";
import { parseArchive, retargetArchiveEnv, secretsFromEnv, ARCHIVE_FORMAT, type ProjectArchive } from "@/lib/archive";
import { capacity } from "@/lib/capacity";
import { reserveFromSpecs, type StoredServerSpecs } from "@/lib/server-specs";
import { readStoredSpecs } from "@/lib/specs-sync";
import { stackEnv, type EnvVar } from "@/lib/compose";
import { generateStackSecrets, realtimeEncKey, type StackSecrets } from "@/lib/secrets";
import { configuredNumber, getSetting, panelApex, serverName } from "@/lib/settings";
import { RAM_STATUSES, TEMPLATE, type AuditEntry, type Job, type JobType, type Project, type ProjectStatus } from "@/lib/template";

type ProjectRow = {
  id: string;
  name: string;
  slug: string;
  status: ProjectStatus;
  api_host: string;
  studio_host: string;
  url_scheme: string | null;
  custom_domain: string | null;
  panel_host: string | null;
  template_id: string;
  template_version: string;
  postgres_major: number;
  coolify_service_uuid: string | null;
  keys_local: number | null;
  volume_key: string | null;
  boot_at: string | null;
  ram_mb: number;
  error: string | null;
  created_at: string;
  updated_at: string;
};

type JobRow = {
  id: string;
  project_id: string | null;
  project_slug: string;
  type: Job["type"];
  status: Job["status"];
  log: string;
  error: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
};

export class PanelError extends Error {}

export const RECOVERED_STACK_MESSAGE =
  "This stack is still on Coolify and its database is still there. Update stack sends the new compose and leaves the keys already on that service. Restore the offline file to see those keys here. Deleting this row keeps the Coolify service.";

function now(): string {
  return new Date().toISOString();
}

function mapProject(row: ProjectRow): Project {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    status: row.status,
    apiHost: row.api_host,
    studioHost: row.studio_host,
    scheme: parseScheme(row.url_scheme || "https"),
    customDomain: row.custom_domain || null,
    panelHost: row.panel_host || null,
    templateId: row.template_id,
    templateVersion: row.template_version,
    postgresMajor: row.postgres_major,
    coolifyServiceUuid: row.coolify_service_uuid,
    keysLocal: row.keys_local == null || Number(row.keys_local) !== 0,
    volumeKey: row.volume_key || null,
    bootAt: row.boot_at || null,
    ramMb: row.ram_mb,
    error: row.error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapJob(row: JobRow): Job {
  return {
    id: row.id,
    projectId: row.project_id,
    projectSlug: row.project_slug,
    type: row.type,
    status: row.status,
    log: row.log,
    error: row.error,
    createdAt: row.created_at,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
  };
}

export function serverSpecs(): StoredServerSpecs | null {
  return readStoredSpecs();
}

export function serverRamMb(): number {
  if (process.env.SERVER_RAM_MB) return Number(process.env.SERVER_RAM_MB);
  const specs = serverSpecs();
  if (specs) return specs.memoryMb;
  return configuredNumber("server_ram_mb", 8192);
}

export function serverReserveMb(): number {
  if (process.env.SERVER_RESERVE_MB) return Number(process.env.SERVER_RESERVE_MB);
  const specs = serverSpecs();
  return reserveFromSpecs(serverRamMb(), process.env.SERVER_RAM_MB ? 0 : (specs?.cpus ?? 0));
}

export function usingDefaultRam(): boolean {
  return !process.env.SERVER_RAM_MB && !serverSpecs() && !getSetting("server_ram_mb");
}

export function reserveBasis(): "env" | "coolify" | "estimated" {
  if (process.env.SERVER_RESERVE_MB) return "env";
  if (!process.env.SERVER_RAM_MB && serverSpecs()?.source === "coolify") return "coolify";
  return "estimated";
}

export function listProjects(): Project[] {
  const rows = getDb().prepare("SELECT * FROM projects ORDER BY created_at DESC").all() as ProjectRow[];
  return rows.map(mapProject);
}

export function getProject(id: string): Project | null {
  const row = getDb().prepare("SELECT * FROM projects WHERE id = ?").get(id) as ProjectRow | undefined;
  return row ? mapProject(row) : null;
}

export function getProjectBySlug(slug: string): Project | null {
  const row = getDb().prepare("SELECT * FROM projects WHERE slug = ?").get(slug) as ProjectRow | undefined;
  return row ? mapProject(row) : null;
}

function assertKeysLocal(project: Project): void {
  if (!project.keysLocal) {
    throw new PanelError(
      "Restore the offline file before changing keys. This panel does not hold the original keys, and saving them would replace the keys on the running stack.",
    );
  }
}

export function capacitySnapshot() {
  const projects = listProjects();
  const activeStacks = projects.filter(
    (project) =>
      (RAM_STATUSES as readonly string[]).includes(project.status) ||
      (project.status === "failed" && Boolean(project.coolifyServiceUuid)),
  ).length;
  return {
    ...capacity({
      serverRamMb: serverRamMb(),
      reserveMb: serverReserveMb(),
      stackRamMb: TEMPLATE.ramMb,
      activeStacks,
    }),
    serverRamMb: serverRamMb(),
    reserveMb: serverReserveMb(),
    stackRamMb: TEMPLATE.ramMb,
    activeStacks,
    usingDefaultRam: usingDefaultRam(),
    serverName: serverName(),
    specs: serverSpecs(),
    reserveBasis: reserveBasis(),
  };
}

function projectHostList(project: Project): string[] {
  return [project.apiHost, project.studioHost, project.customDomain, project.panelHost].filter((host): host is string => Boolean(host));
}

function projectInventory(projects: Project[]): string {
  const count = `${projects.length} project${projects.length === 1 ? "" : "s"}`;
  if (!projects.length) return `This panel has ${count}.`;
  const lines = projects.map((project) => {
    const hosts = projectHostList(project).join(", ");
    return `${project.name} (${project.slug}, ${project.status}): ${hosts}`;
  });
  return `This panel has ${count}.\n${lines.join("\n")}`;
}

function assertHostsFree(hosts: string[], exceptId?: string): void {
  const wanted = hosts.filter(Boolean);
  const projects = listProjects();
  const others = projects.filter((project) => project.id !== exceptId);
  const taken = new Set(others.flatMap(projectHostList));
  const hits = wanted.filter((host) => taken.has(host));
  if (!hits.length) return;
  const owners = others.filter((project) => projectHostList(project).some((host) => hits.includes(host)));
  const who = owners.map((project) => `${project.name} (${project.slug})`).join(", ");
  throw new PanelError(`${hits.join(", ")} is already used by ${who}. ${projectInventory(projects)}`);
}

export function writeAudit(action: string, project: { id?: string | null; slug: string }, detail: string): void {
  getDb()
    .prepare("INSERT INTO audit (id, at, action, project_id, project_slug, detail) VALUES (?, ?, ?, ?, ?, ?)")
    .run(randomUUID(), now(), action, project.id ?? null, project.slug, detail);
}

export function listAudit(limit = 40): AuditEntry[] {
  const rows = getDb()
    .prepare("SELECT * FROM audit ORDER BY at DESC LIMIT ?")
    .all(limit) as {
    id: string;
    at: string;
    action: string;
    project_id: string | null;
    project_slug: string;
    detail: string;
  }[];
  return rows.map((row) => ({
    id: row.id,
    at: row.at,
    action: row.action,
    projectId: row.project_id,
    projectSlug: row.project_slug,
    detail: row.detail,
  }));
}

function enqueue(project: Project, type: JobType): void {
  getDb()
    .prepare(
      "INSERT INTO jobs (id, project_id, project_slug, type, status, log, created_at) VALUES (?, ?, ?, ?, 'pending', '', ?)",
    )
    .run(randomUUID(), project.id, project.slug, type, now());
}

function setStatus(id: string, status: ProjectStatus, error: string | null = null): void {
  getDb()
    .prepare("UPDATE projects SET status = ?, error = ?, updated_at = ? WHERE id = ?")
    .run(status, error, now(), id);
}

export function createProject(input: {
  name: string;
  slug: string;
  scheme?: string;
  customDomain?: string;
  panelHost?: string;
}): Project {
  const name = input.name.trim().replace(/\s+/g, " ");
  const slug = input.slug.trim().toLowerCase();
  if (name.length < 1 || name.length > 80) throw new PanelError("Name must be 1–80 characters.");
  const slugError = validateSlug(slug);
  if (slugError) throw new PanelError(slugError);
  const apex = panelApex();
  const apexError = validateApex(apex);
  if (apexError) throw new PanelError(apexError);

  const resolved = resolveAddressInput({
    slug,
    apex,
    scheme: input.scheme || "https",
    customDomain: input.customDomain || "",
    panelHost: input.panelHost || "",
  });
  if (resolved.error) throw new PanelError(resolved.error);
  const addresses = resolved.addresses;
  assertHostsFree([
    addresses.apiHost,
    addresses.studioHost,
    addresses.customDomain || "",
    addresses.panelHost || "",
  ].filter(Boolean));

  const room = capacitySnapshot();
  if (!room.canCreate) {
    throw new PanelError(
      `Not enough RAM. ${room.freeMb} MB free after the ${room.reserveMb} MB reserve, and a stack needs ${room.stackRamMb} MB.`,
    );
  }

  const id = randomUUID();
  const timestamp = now();
  const database = getDb();
  const secrets = generateStackSecrets();
  const packed = encryptJson(secrets);
  const envPacked = encryptJson(
    applyAddressEnv(
      stackEnv({
        name,
        slug,
        apiUrl: addresses.canonicalApiUrl,
        secrets,
      }),
      addresses,
    ),
  );

  database.exec("BEGIN IMMEDIATE");
  try {
    database
      .prepare(
        `INSERT INTO projects (
          id, name, slug, status, api_host, studio_host, template_id, template_version,
          postgres_major, ram_mb, url_scheme, custom_domain, panel_host, volume_key, created_at, updated_at
        ) VALUES (?, ?, ?, 'queued', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        name,
        slug,
        addresses.apiHost,
        addresses.studioHost,
        TEMPLATE.id,
        TEMPLATE.version,
        TEMPLATE.postgresMajor,
        TEMPLATE.ramMb,
        addresses.scheme,
        addresses.customDomain,
        addresses.panelHost,
        id,
        timestamp,
        timestamp,
      );
    database
      .prepare("INSERT INTO secrets (project_id, ciphertext, nonce, updated_at) VALUES (?, ?, ?, ?)")
      .run(id, packed.ciphertext, packed.nonce, timestamp);
    database
      .prepare("INSERT INTO project_env (project_id, ciphertext, nonce, updated_at) VALUES (?, ?, ?, ?)")
      .run(id, envPacked.ciphertext, envPacked.nonce, timestamp);
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    if (error instanceof Error && error.message.includes("UNIQUE")) {
      throw new PanelError("A project with that slug already exists.");
    }
    throw error;
  }

  const project = getProject(id);
  if (!project) throw new PanelError("Project was not saved.");
  enqueue(project, "provision");
  writeAudit("project.created", project, `Queued ${addresses.canonicalApiUrl}`);
  return project;
}

export function updateProjectAddresses(
  projectId: string,
  input: { scheme: string; customDomain: string; panelHost: string },
): void {
  const project = getProject(projectId);
  if (!project) throw new PanelError("Project not found.");
  const apex = panelApex();
  const resolved = resolveAddressInput({
    slug: project.slug,
    apex,
    scheme: input.scheme,
    customDomain: input.customDomain,
    panelHost: input.panelHost,
  });
  if (resolved.error) throw new PanelError(resolved.error);
  const addresses = resolved.addresses;
  assertHostsFree(
    [addresses.apiHost, addresses.studioHost, addresses.customDomain || "", addresses.panelHost || ""].filter(Boolean),
    project.id,
  );
  getDb()
    .prepare(
      "UPDATE projects SET url_scheme = ?, custom_domain = ?, panel_host = ?, updated_at = ? WHERE id = ?",
    )
    .run(addresses.scheme, addresses.customDomain, addresses.panelHost, now(), project.id);
  saveEnv(project.id, applyAddressEnv(readEnv(project.id), addresses));
  writeAudit("project.addresses", project, addresses.canonicalApiUrl);
  const current = getProject(project.id);
  if (current?.coolifyServiceUuid && ["running", "starting", "paused", "failed"].includes(current.status)) {
    enqueue(current, "sync-env");
  }
}

export function exportProjectArchive(projectId: string): ProjectArchive {
  const project = getProject(projectId);
  if (!project) throw new PanelError("Project not found.");
  assertKeysLocal(project);
  const env = readEnv(projectId);
  writeAudit("project.exported", project, project.slug);
  return {
    format: ARCHIVE_FORMAT,
    version: 1,
    exportedAt: new Date().toISOString(),
    name: project.name,
    slug: project.slug,
    postgresMajor: project.postgresMajor,
    scheme: project.scheme,
    customDomain: project.customDomain,
    panelHost: project.panelHost,
    env,
  };
}

export function rememberRunningService(input: {
  slug: string;
  uuid: string;
  apiHost: string;
  studioHost: string;
  envValues: Record<string, string>;
}): Project | null {
  if (validateSlug(input.slug)) return null;
  const existing = getProjectBySlug(input.slug);
  if (existing) {
    const creating = existing.status === "queued" || existing.status === "provisioning" || existing.status === "deleting";
    if (!existing.coolifyServiceUuid && !creating) updateProjectState(existing.id, { coolifyServiceUuid: input.uuid });
    return getProject(existing.id);
  }
  const apex = panelApex();
  if (validateApex(apex)) return null;
  const defaults = hostsFor(input.slug, apex);
  const resolved = resolveAddressInput({
    slug: input.slug,
    apex,
    scheme: "https",
    customDomain: input.apiHost === defaults.apiHost ? "" : input.apiHost,
    panelHost: input.studioHost === defaults.studioHost ? "" : input.studioHost,
  });
  if (resolved.error) return null;
  const addresses = resolved.addresses;
  try {
    assertHostsFree(
      [addresses.apiHost, addresses.studioHost, addresses.customDomain || "", addresses.panelHost || ""].filter(Boolean),
    );
  } catch {
    return null;
  }

  const required = ["POSTGRES_PASSWORD", "JWT_SECRET", "ANON_KEY", "SERVICE_ROLE_KEY"] as const;
  const haveKeys = required.every((key) => Boolean(input.envValues[key]));
  const generated = generateStackSecrets();
  const secrets = haveKeys
    ? {
        ...generated,
        postgresPassword: input.envValues.POSTGRES_PASSWORD,
        jwtSecret: input.envValues.JWT_SECRET,
        anonKey: input.envValues.ANON_KEY,
        serviceRoleKey: input.envValues.SERVICE_ROLE_KEY,
        secretKeyBase: input.envValues.SECRET_KEY_BASE || generated.secretKeyBase,
        pgMetaCryptoKey: input.envValues.PG_META_CRYPTO_KEY || generated.pgMetaCryptoKey,
        realtimeDbEncKey: input.envValues.REALTIME_DB_ENC_KEY || generated.realtimeDbEncKey,
        dashboardUsername: input.envValues.DASHBOARD_USERNAME || generated.dashboardUsername,
        dashboardPassword: input.envValues.DASHBOARD_PASSWORD || generated.dashboardPassword,
        s3ProtocolAccessKeyId: input.envValues.S3_PROTOCOL_ACCESS_KEY_ID || generated.s3ProtocolAccessKeyId,
        s3ProtocolAccessKeySecret: input.envValues.S3_PROTOCOL_ACCESS_KEY_SECRET || generated.s3ProtocolAccessKeySecret,
      }
    : generated;
  const env = applyAddressEnv(
    stackEnv({ name: input.slug, slug: input.slug, apiUrl: addresses.canonicalApiUrl, secrets }),
    addresses,
  );
  if (haveKeys) {
    for (const [key, value] of Object.entries(input.envValues)) {
      if (env[key] && value) env[key] = { ...env[key], value };
    }
  }

  const id = randomUUID();
  const timestamp = now();
  const packed = encryptJson(secrets);
  const envPacked = encryptJson(env);
  const database = getDb();
  database.exec("BEGIN IMMEDIATE");
  try {
    database
      .prepare(
        `INSERT INTO projects (
          id, name, slug, status, api_host, studio_host, template_id, template_version,
          postgres_major, coolify_service_uuid, ram_mb, error, url_scheme, custom_domain, panel_host,
          keys_local, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        input.slug,
        input.slug,
        "running",
        addresses.apiHost,
        addresses.studioHost,
        TEMPLATE.id,
        TEMPLATE.version,
        TEMPLATE.postgresMajor,
        input.uuid,
        TEMPLATE.ramMb,
        haveKeys ? null : RECOVERED_STACK_MESSAGE,
        addresses.scheme,
        addresses.customDomain,
        addresses.panelHost,
        haveKeys ? 1 : 0,
        timestamp,
        timestamp,
      );
    database
      .prepare("INSERT INTO secrets (project_id, ciphertext, nonce, updated_at) VALUES (?, ?, ?, ?)")
      .run(id, packed.ciphertext, packed.nonce, timestamp);
    database
      .prepare("INSERT INTO project_env (project_id, ciphertext, nonce, updated_at) VALUES (?, ?, ?, ?)")
      .run(id, envPacked.ciphertext, envPacked.nonce, timestamp);
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    if (error instanceof Error && error.message.includes("UNIQUE")) return null;
    throw error;
  }
  const project = getProject(id);
  if (project) writeAudit("project.recovered", project, input.uuid);
  return project;
}

export function restoreProject(input: unknown, slugOverride?: string): Project {
  const archive = parseArchive(input);
  const name = archive.name;
  const slug = (slugOverride || archive.slug).trim().toLowerCase();
  const slugError = validateSlug(slug);
  if (slugError) throw new PanelError(slugError);
  const apex = panelApex();
  const apexError = validateApex(apex);
  if (apexError) throw new PanelError(apexError);
  const resolved = resolveAddressInput({
    slug,
    apex,
    scheme: archive.scheme,
    customDomain: archive.customDomain || "",
    panelHost: archive.panelHost || "",
  });
  if (resolved.error) throw new PanelError(resolved.error);
  const addresses = resolved.addresses;
  const existing = getProjectBySlug(slug);
  if (existing && !existing.keysLocal) {
    assertHostsFree(
      [addresses.apiHost, addresses.studioHost, addresses.customDomain || "", addresses.panelHost || ""].filter(Boolean),
      existing.id,
    );
    const apiUrl = addresses.canonicalApiUrl;
    const baseEnv = slug === archive.slug ? archive.env : retargetArchiveEnv(archive.env, { name, slug, apiUrl });
    const env = applyAddressEnv(baseEnv, addresses);
    const secrets = secretsFromEnv(env);
    const timestamp = now();
    const packed = encryptJson(secrets);
    const envPacked = encryptJson(env);
    const database = getDb();
    database.exec("BEGIN IMMEDIATE");
    try {
      database
        .prepare(
          `UPDATE projects
           SET name = ?, status = 'queued', api_host = ?, studio_host = ?, url_scheme = ?, custom_domain = ?,
               panel_host = ?, error = NULL, keys_local = 1, updated_at = ?
           WHERE id = ?`,
        )
        .run(
          name,
          addresses.apiHost,
          addresses.studioHost,
          addresses.scheme,
          addresses.customDomain,
          addresses.panelHost,
          timestamp,
          existing.id,
        );
      database
        .prepare("UPDATE secrets SET ciphertext = ?, nonce = ?, updated_at = ? WHERE project_id = ?")
        .run(packed.ciphertext, packed.nonce, timestamp, existing.id);
      database
        .prepare("UPDATE project_env SET ciphertext = ?, nonce = ?, updated_at = ? WHERE project_id = ?")
        .run(envPacked.ciphertext, envPacked.nonce, timestamp, existing.id);
      database.exec("COMMIT");
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }
    const project = getProject(existing.id);
    if (!project) throw new PanelError("Project was not restored.");
    enqueue(project, "provision");
    writeAudit("project.restored", project, `Restored keys for ${slug}`);
    return project;
  }
  assertHostsFree([
    addresses.apiHost,
    addresses.studioHost,
    addresses.customDomain || "",
    addresses.panelHost || "",
  ].filter(Boolean));
  const room = capacitySnapshot();
  if (!room.canCreate) {
    throw new PanelError(
      `Not enough RAM. ${room.freeMb} MB free after the ${room.reserveMb} MB reserve, and a stack needs ${room.stackRamMb} MB.`,
    );
  }

  const apiUrl = addresses.canonicalApiUrl;
  const baseEnv = slug === archive.slug ? archive.env : retargetArchiveEnv(archive.env, { name, slug, apiUrl });
  const env = applyAddressEnv(baseEnv, addresses);
  const secrets = secretsFromEnv(env);
  const id = randomUUID();
  const timestamp = now();
  const packed = encryptJson(secrets);
  const envPacked = encryptJson(env);
  const database = getDb();

  database.exec("BEGIN IMMEDIATE");
  try {
    database
      .prepare(
        `INSERT INTO projects (
          id, name, slug, status, api_host, studio_host, template_id, template_version,
          postgres_major, ram_mb, url_scheme, custom_domain, panel_host, volume_key, created_at, updated_at
        ) VALUES (?, ?, ?, 'queued', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        name,
        slug,
        addresses.apiHost,
        addresses.studioHost,
        TEMPLATE.id,
        TEMPLATE.version,
        TEMPLATE.postgresMajor,
        TEMPLATE.ramMb,
        addresses.scheme,
        addresses.customDomain,
        addresses.panelHost,
        id,
        timestamp,
        timestamp,
      );
    database
      .prepare("INSERT INTO secrets (project_id, ciphertext, nonce, updated_at) VALUES (?, ?, ?, ?)")
      .run(id, packed.ciphertext, packed.nonce, timestamp);
    database
      .prepare("INSERT INTO project_env (project_id, ciphertext, nonce, updated_at) VALUES (?, ?, ?, ?)")
      .run(id, envPacked.ciphertext, envPacked.nonce, timestamp);
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    if (error instanceof Error && error.message.includes("UNIQUE")) {
      throw new PanelError("A project with that slug already exists.");
    }
    throw error;
  }

  const project = getProject(id);
  if (!project) throw new PanelError("Project was not restored.");
  enqueue(project, "provision");
  writeAudit("project.restored", project, `Restored ${archive.slug} as ${slug}`);
  return project;
}

function requireProject(id: string, statuses: ProjectStatus[], label: string): Project {
  const project = getProject(id);
  if (!project) throw new PanelError("Project not found.");
  if (!statuses.includes(project.status)) {
    throw new PanelError(`Cannot ${label} a project that is ${project.status}.`);
  }
  return project;
}

export function requestPause(id: string): Project {
  const project = requireProject(id, ["running", "failed"], "pause");
  setStatus(id, "pausing");
  const next = getProject(id)!;
  enqueue(next, "pause");
  return next;
}

export function requestResume(id: string): Project {
  const project = requireProject(id, ["paused", "failed"], "resume");
  setStatus(id, "resuming");
  const next = getProject(id)!;
  enqueue(next, "resume");
  return next;
}

export function requestDelete(id: string): Project {
  const project = requireProject(
    id,
    ["queued", "provisioning", "starting", "running", "pausing", "paused", "resuming", "failed"],
    "delete",
  );
  setStatus(id, "deleting");
  const next = getProject(id)!;
  enqueue(next, "delete");
  return next;
}

export function requestProvision(id: string): Project {
  const project = requireProject(id, ["failed", "queued", "running", "starting"], "provision");
  if (!project.keysLocal && !project.coolifyServiceUuid) throw new PanelError(RECOVERED_STACK_MESSAGE);
  setStatus(id, "queued");
  const next = getProject(id)!;
  enqueue(next, "provision");
  return next;
}

export function readSecrets(projectId: string): StackSecrets {
  const row = getDb()
    .prepare("SELECT ciphertext, nonce FROM secrets WHERE project_id = ?")
    .get(projectId) as { ciphertext: string; nonce: string } | undefined;
  if (!row) throw new PanelError("Secrets for this project are missing.");
  return decryptJson<StackSecrets>(row.ciphertext, row.nonce);
}

export type SecretKind = "serviceRole" | "postgres" | "studio" | "jwt";

export function revealSecret(projectId: string, kind: SecretKind): string {
  const project = getProject(projectId);
  if (!project) throw new PanelError("Project not found.");
  const secrets = readSecrets(projectId);
  const value = {
    serviceRole: secrets.serviceRoleKey,
    postgres: secrets.postgresPassword,
    studio: secrets.dashboardPassword,
    jwt: secrets.jwtSecret,
  }[kind];
  writeAudit("secret.revealed", project, kind);
  return value;
}

export function publishableKey(projectId: string): string {
  return readSecrets(projectId).anonKey;
}

export type PublicEnv = { key: string; secret: boolean; value: string | null };

function saveEnv(projectId: string, env: Record<string, EnvVar>): void {
  const packed = encryptJson(env);
  getDb()
    .prepare(
      `INSERT INTO project_env (project_id, ciphertext, nonce, updated_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(project_id) DO UPDATE SET ciphertext = excluded.ciphertext, nonce = excluded.nonce, updated_at = excluded.updated_at`,
    )
    .run(projectId, packed.ciphertext, packed.nonce, now());
}

export function readEnv(projectId: string): Record<string, EnvVar> {
  const row = getDb()
    .prepare("SELECT ciphertext, nonce FROM project_env WHERE project_id = ?")
    .get(projectId) as { ciphertext: string; nonce: string } | undefined;
  if (row) {
    const saved = decryptJson<Record<string, EnvVar>>(row.ciphertext, row.nonce);
    const project = getProject(projectId);
    if (!project) return saved;
    let secrets: StackSecrets;
    try {
      secrets = readSecrets(projectId);
    } catch {
      return saved;
    }
    const fresh = stackEnv({
      name: project.name,
      slug: project.slug,
      apiUrl: `https://${project.apiHost}`,
      secrets,
    });
    let changed = false;
    for (const [key, item] of Object.entries(fresh)) {
      if (!saved[key]) {
        saved[key] = item;
        changed = true;
      }
    }
    if (
      saved.SERVICE_ROLE_KEY?.value &&
      saved.SUPABASE_SERVICE_ROLE_KEY &&
      saved.SUPABASE_SERVICE_ROLE_KEY.value !== saved.SERVICE_ROLE_KEY.value
    ) {
      saved.SUPABASE_SERVICE_ROLE_KEY = { ...saved.SUPABASE_SERVICE_ROLE_KEY, value: saved.SERVICE_ROLE_KEY.value };
      changed = true;
    }
    if (saved.REALTIME_DB_ENC_KEY && saved.REALTIME_DB_ENC_KEY.value.length !== 16) {
      const value = realtimeEncKey();
      saved.REALTIME_DB_ENC_KEY = { ...saved.REALTIME_DB_ENC_KEY, value };
      try {
        const packed = encryptJson({ ...secrets, realtimeDbEncKey: value });
        getDb()
          .prepare("UPDATE secrets SET ciphertext = ?, nonce = ?, updated_at = ? WHERE project_id = ?")
          .run(packed.ciphertext, packed.nonce, now(), projectId);
      } catch {
        // A recovered project can correct the compose value without a readable secret copy.
      }
      changed = true;
    }
    if (changed) saveEnv(projectId, saved);
    return saved;
  }
  const project = getProject(projectId);
  if (!project) throw new PanelError("Project not found.");
  const env = stackEnv({
    name: project.name,
    slug: project.slug,
    apiUrl: `https://${project.apiHost}`,
    secrets: readSecrets(projectId),
  });
  saveEnv(projectId, env);
  return env;
}

export function listEnvPublic(projectId: string): PublicEnv[] {
  return Object.entries(readEnv(projectId))
    .map(([key, item]) => ({ key, secret: item.secret, value: item.secret ? null : item.value }))
    .sort((a, b) => Number(b.secret) - Number(a.secret) || a.key.localeCompare(b.key));
}

export function readEnvValue(projectId: string, key: string): string {
  const project = getProject(projectId);
  if (!project) throw new PanelError("Project not found.");
  const env = readEnv(projectId);
  const item = env[key];
  if (!item) throw new PanelError("That variable is not part of this stack.");
  if (item.secret) writeAudit("secret.revealed", project, key);
  return item.value;
}

const SECRET_FIELDS: Record<string, keyof StackSecrets> = {
  JWT_SECRET: "jwtSecret",
  ANON_KEY: "anonKey",
  SERVICE_ROLE_KEY: "serviceRoleKey",
  SUPABASE_SERVICE_ROLE_KEY: "serviceRoleKey",
  POSTGRES_PASSWORD: "postgresPassword",
  DASHBOARD_PASSWORD: "dashboardPassword",
};

export function updateEnvValue(projectId: string, key: string, value: string): void {
  if (!/^[A-Z][A-Z0-9_]*$/.test(key)) throw new PanelError("Use an env key like SITE_URL.");
  if (value.length > 8000) throw new PanelError("That value is too long.");
  const project = getProject(projectId);
  if (!project) throw new PanelError("Project not found.");
  assertKeysLocal(project);
  const env = readEnv(projectId);
  if (!env[key]) throw new PanelError("That variable is not part of this stack.");
  env[key] = { ...env[key], value };
  if (key === "SERVICE_ROLE_KEY" && env.SUPABASE_SERVICE_ROLE_KEY) {
    env.SUPABASE_SERVICE_ROLE_KEY = { ...env.SUPABASE_SERVICE_ROLE_KEY, value };
  }
  if (key === "SUPABASE_SERVICE_ROLE_KEY" && env.SERVICE_ROLE_KEY) {
    env.SERVICE_ROLE_KEY = { ...env.SERVICE_ROLE_KEY, value };
  }
  saveEnv(projectId, env);
  const secretField = SECRET_FIELDS[key];
  if (secretField) {
    const secrets = readSecrets(projectId);
    secrets[secretField] = value;
    const packed = encryptJson(secrets);
    getDb()
      .prepare("UPDATE secrets SET ciphertext = ?, nonce = ?, updated_at = ? WHERE project_id = ?")
      .run(packed.ciphertext, packed.nonce, now(), projectId);
  }
  writeAudit("env.updated", project, key);
  if (project.coolifyServiceUuid && ["running", "starting", "paused", "failed"].includes(project.status)) {
    enqueue(project, "sync-env");
  }
}

export function updateProjectState(
  id: string,
  patch: Partial<{ status: ProjectStatus; error: string | null; coolifyServiceUuid: string | null }>,
): void {
  const project = getProject(id);
  if (!project) return;
  const nextStatus = patch.status ?? project.status;
  const bootAt = nextStatus === "starting" ? (project.status === "starting" ? project.bootAt : now()) : null;
  getDb()
    .prepare(
      "UPDATE projects SET status = ?, error = ?, coolify_service_uuid = ?, boot_at = ?, updated_at = ? WHERE id = ?",
    )
    .run(
      nextStatus,
      patch.error === undefined ? project.error : patch.error,
      patch.coolifyServiceUuid === undefined ? project.coolifyServiceUuid : patch.coolifyServiceUuid,
      bootAt,
      now(),
      id,
    );
}

export function removeProject(id: string): void {
  getDb().prepare("DELETE FROM projects WHERE id = ?").run(id);
}

export function listJobs(limit = 30): Job[] {
  const rows = getDb().prepare("SELECT * FROM jobs ORDER BY created_at DESC LIMIT ?").all(limit) as JobRow[];
  return rows.map(mapJob);
}

export function latestJob(projectId: string): Job | null {
  const row = getDb()
    .prepare("SELECT * FROM jobs WHERE project_id = ? ORDER BY created_at DESC LIMIT 1")
    .get(projectId) as JobRow | undefined;
  return row ? mapJob(row) : null;
}

export function claimJob(): Job | null {
  const database = getDb();
  database.exec("BEGIN IMMEDIATE");
  try {
    const row = database
      .prepare("SELECT * FROM jobs WHERE status = 'pending' ORDER BY created_at LIMIT 1")
      .get() as JobRow | undefined;
    if (!row) {
      database.exec("COMMIT");
      return null;
    }
    database.prepare("UPDATE jobs SET status = 'running', started_at = ? WHERE id = ?").run(now(), row.id);
    database.exec("COMMIT");
    return mapJob({ ...row, status: "running" });
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

export function appendJobLog(id: string, line: string): void {
  const job = getDb().prepare("SELECT log FROM jobs WHERE id = ?").get(id) as { log: string } | undefined;
  if (!job) return;
  const next = job.log ? `${job.log}\n${line}` : line;
  getDb().prepare("UPDATE jobs SET log = ? WHERE id = ?").run(next, id);
}

export function finishJob(id: string, status: "done" | "failed", error: string | null = null): void {
  getDb()
    .prepare("UPDATE jobs SET status = ?, error = ?, finished_at = ? WHERE id = ?")
    .run(status, error, now(), id);
}
