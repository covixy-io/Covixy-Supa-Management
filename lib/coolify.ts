import type { EnvVar } from "@/lib/compose";
import { coolifyConfig } from "@/lib/settings";

export type CoolifyMode = "live" | "rehearsal";

export function coolifyMode(): CoolifyMode {
  const config = coolifyConfig();
  if (config.url && config.token && config.project && config.server) return "live";
  return "rehearsal";
}

function coolifyErrorDetails(errors: unknown): string {
  if (!errors || typeof errors !== "object") return "";
  return Object.entries(errors as Record<string, unknown>)
    .map(([field, value]) => {
      const text = Array.isArray(value) ? value.map(String).join(" ") : String(value);
      return `${field}: ${text}`;
    })
    .join(" ");
}

function coolifyConflictDetails(conflicts: unknown): string {
  if (!Array.isArray(conflicts)) return "";
  return conflicts
    .map((conflict) => {
      if (!conflict || typeof conflict !== "object") return "";
      const row = conflict as { domain?: unknown; message?: unknown; resource_name?: unknown };
      if (typeof row.message === "string" && row.message) return row.message;
      const domain = typeof row.domain === "string" ? row.domain : "";
      const name = typeof row.resource_name === "string" ? row.resource_name : "";
      return [domain, name].filter(Boolean).join(" is already used by ");
    })
    .filter(Boolean)
    .join(" ");
}

function apiBase(): string {
  const raw = coolifyConfig().url.replace(/\/$/, "");
  return raw.endsWith("/api/v1") ? raw : `${raw}/api/v1`;
}

async function coolifyFetch(path: string, init?: RequestInit): Promise<unknown> {
  const response = await fetch(`${apiBase()}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${coolifyConfig().token}`,
      Accept: "application/json",
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  const text = await response.text();
  if (!response.ok) {
    let message = text.slice(0, 800);
    try {
      const body = JSON.parse(text) as { message?: string; errors?: unknown; conflicts?: unknown };
      if (body.message) message = body.message;
      const details = [coolifyErrorDetails(body.errors), coolifyConflictDetails(body.conflicts)].filter(Boolean).join(" ");
      if (details) message = `${message} ${details}`;
    } catch {
      // Coolify sometimes returns plain text.
    }
    if (response.status === 401) {
      message =
        "Unauthenticated. Create an API token under Keys & Tokens and paste the whole line, including the number and the vertical bar.";
    }
    throw new Error(`Coolify ${response.status}: ${message}`);
  }
  if (!text) return {};
  return JSON.parse(text) as unknown;
}

export async function createService(input: {
  slug: string;
  name: string;
  compose: string;
  urls: { name: string; url: string }[];
}): Promise<string> {
  if (coolifyMode() === "rehearsal") return `rehearsal-${input.slug}`;

  const body: Record<string, unknown> = {
    name: `supa-${input.slug}`,
    description: `Supabase stack for ${input.name}`,
    project_uuid: coolifyConfig().project,
    environment_name: coolifyConfig().environment,
    server_uuid: coolifyConfig().server,
    instant_deploy: false,
    docker_compose_raw: Buffer.from(input.compose, "utf8").toString("base64"),
    urls: input.urls,
    force_domain_override: true,
  };
  if (coolifyConfig().destination) body.destination_uuid = coolifyConfig().destination;

  let created: { uuid?: string };
  try {
    created = (await coolifyFetch("/services", {
      method: "POST",
      body: JSON.stringify(body),
    })) as { uuid?: string };
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const urlsRejected = /urls:.*not allowed/i.test(message) || /domain conflict/i.test(message);
    if (!urlsRejected) throw error;
    const withoutUrls = { ...body };
    delete withoutUrls.urls;
    delete withoutUrls.force_domain_override;
    created = (await coolifyFetch("/services", {
      method: "POST",
      body: JSON.stringify(withoutUrls),
    })) as { uuid?: string };
  }
  if (!created.uuid) throw new Error("Coolify did not return a service UUID.");
  return created.uuid;
}

export async function updateServiceCompose(uuid: string, compose: string): Promise<void> {
  if (coolifyMode() === "rehearsal") return;
  await coolifyFetch(`/services/${uuid}`, {
    method: "PATCH",
    body: JSON.stringify({ docker_compose_raw: Buffer.from(compose, "utf8").toString("base64") }),
  });
}

export async function restartOrStart(uuid: string): Promise<void> {
  if (coolifyMode() === "rehearsal") return;
  try {
    await restartService(uuid);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (/stopped|not running|exited/i.test(message)) {
      await startService(uuid);
      return;
    }
    throw error;
  }
}

export async function updateServiceUrls(uuid: string, urls: { name: string; url: string }[]): Promise<void> {
  if (coolifyMode() === "rehearsal") return;
  await coolifyFetch(`/services/${uuid}`, {
    method: "PATCH",
    body: JSON.stringify({ urls, force_domain_override: true }),
  });
}

export async function setServiceEnv(uuid: string, env: Record<string, EnvVar>): Promise<void> {
  if (coolifyMode() === "rehearsal") return;
  await coolifyFetch(`/services/${uuid}/envs/bulk`, {
    method: "PATCH",
    body: JSON.stringify({
      data: Object.entries(env).map(([key, item]) => ({
        key,
        value: item.value,
        is_preview: false,
        is_literal: true,
        is_multiline: false,
        is_shown_once: item.secret,
      })),
    }),
  });
}

export async function restartService(uuid: string): Promise<void> {
  if (coolifyMode() === "rehearsal") return;
  await coolifyFetch(`/services/${uuid}/restart`, { method: "POST" });
}

export async function startService(uuid: string): Promise<void> {
  if (coolifyMode() === "rehearsal") return;
  await coolifyFetch(`/services/${uuid}/start`, { method: "POST" });
}

export async function stopService(uuid: string): Promise<void> {
  if (coolifyMode() === "rehearsal") return;
  await coolifyFetch(`/services/${uuid}/stop?docker_cleanup=false`, { method: "POST" });
}

export async function deleteService(uuid: string): Promise<void> {
  if (coolifyMode() === "rehearsal") return;
  const query = new URLSearchParams({
    delete_configurations: "true",
    delete_volumes: "true",
    docker_cleanup: "false",
    delete_connected_networks: "true",
  });
  await coolifyFetch(`/services/${uuid}?${query}`, { method: "DELETE" });
}

function statusText(value: unknown): string {
  if (typeof value === "string") return value.toLowerCase();
  if (value && typeof value === "object") {
    const row = value as { status?: unknown; state?: unknown };
    if (row.status !== undefined && row.status !== value) return statusText(row.status);
    if (typeof row.state === "string") return row.state.toLowerCase();
  }
  return "";
}

export function serviceReadiness(payload: unknown): "starting" | "running" | "failed" {
  const body = payload && typeof payload === "object" ? (payload as { status?: unknown; applications?: unknown; databases?: unknown }) : {};
  const children = [...asRows(body.applications), ...asRows(body.databases)];
  const statuses = (children.length ? children : [{ status: body.status }])
    .map((row) => statusText(row.status))
    .filter(Boolean);
  if (!statuses.length) return "starting";
  const pending = (status: string) =>
    !status.startsWith("running") &&
    ["unknown", "starting", "restart", "created", "pull", "removing"].some((word) => status.includes(word));
  const down = (status: string) => ["unhealthy", "exited", "dead"].some((word) => status.includes(word));
  const up = (status: string) =>
    !pending(status) && !down(status) && (status.includes("running") || status.includes("healthy"));
  if (statuses.every(up)) return "running";
  if (statuses.some(down) && !statuses.some(pending)) return "failed";
  return "starting";
}

export function hostsFromCoolifyService(
  payload: unknown,
  slug: string,
  apex: string,
): { apiHost: string; studioHost: string } {
  const found: string[] = [];
  const visit = (value: unknown): void => {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    const row = value as Record<string, unknown>;
    for (const key of ["fqdn", "url"]) {
      if (typeof row[key] === "string") found.push(row[key]);
    }
    for (const child of Object.values(row)) {
      if (child && typeof child === "object") visit(child);
    }
  };
  visit(payload);
  const hosts = [
    ...new Set(
      found
        .flatMap((entry) => entry.split(","))
        .map((part) => part.trim().replace(/^https?:\/\//i, "").split("/")[0].toLowerCase())
        .filter((host) => host.includes(".")),
    ),
  ];
  const studioHost =
    hosts.find((host) => host.startsWith(`${slug}-studio.`)) ||
    hosts.find((host) => host.includes("-studio.")) ||
    `${slug}-studio.${apex}`;
  const apiHost = hosts.find((host) => host !== studioHost) || `${slug}.${apex}`;
  return { apiHost, studioHost };
}

function asRows(value: unknown): { status?: unknown }[] {
  return Array.isArray(value) ? (value as { status?: unknown }[]) : [];
}

function asList(data: unknown): unknown[] {
  if (Array.isArray(data)) return data;
  if (data && typeof data === "object" && Array.isArray((data as { data?: unknown }).data)) {
    return (data as { data: unknown[] }).data;
  }
  return [];
}

export async function getService(uuid: string): Promise<unknown> {
  return coolifyFetch(`/services/${encodeURIComponent(uuid)}`);
}

export async function listServices(): Promise<{ name: string; uuid: string }[]> {
  if (coolifyMode() === "rehearsal") return [];
  return asList(await coolifyFetch("/services"))
    .map((row) => {
      const item = row as { name?: string; uuid?: string };
      return { name: String(item.name || ""), uuid: String(item.uuid || "") };
    })
    .filter((item) => item.uuid);
}

export async function readServiceEnvValues(uuid: string): Promise<Record<string, string>> {
  if (coolifyMode() === "rehearsal") return {};
  const values: Record<string, string> = {};
  for (const row of asList(await coolifyFetch(`/services/${encodeURIComponent(uuid)}/envs`))) {
    const item = row as { key?: string; value?: unknown };
    if (item.key && typeof item.value === "string" && item.value) values[item.key] = item.value;
  }
  return values;
}

export async function fetchConfiguredServer(): Promise<unknown | null> {
  if (coolifyMode() !== "live") return null;
  const uuid = coolifyConfig().server;
  if (!uuid) return null;
  return coolifyFetch(`/servers/${encodeURIComponent(uuid)}`, { signal: AbortSignal.timeout(4000) });
}

export async function listServers(): Promise<{ name: string; uuid: string }[]> {
  if (coolifyMode() === "rehearsal") return [];
  const data = await coolifyFetch("/servers");
  if (!Array.isArray(data)) return [];
  return data.map((server) => {
    const row = server as { name?: string; uuid?: string };
    return { name: String(row.name || "server"), uuid: String(row.uuid || "") };
  });
}
