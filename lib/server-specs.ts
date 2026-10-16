export const SPECS_KEY = "server_specs";

export type StoredServerSpecs = {
  source: "coolify" | "manual";
  memoryMb: number;
  cpus: number;
  os: string;
  arch: string;
  kernel: string;
  docker: string;
  name: string;
  reachable: boolean | null;
  collectedAt: string;
  diskMb: number | null;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value === "string") {
    try {
      return asRecord(JSON.parse(value));
    } catch {
      return null;
    }
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function numberOf(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function memoryMb(value: unknown): number {
  const amount = numberOf(value);
  if (amount >= 10_000_000) return Math.round(amount / (1024 * 1024));
  if (amount >= 256) return Math.round(amount);
  return 0;
}

export function reserveFromSpecs(memoryMbValue: number, cpus: number): number {
  if (!Number.isFinite(memoryMbValue) || memoryMbValue <= 0) return 0;
  const fromRam = Math.round(memoryMbValue * 0.2);
  const fromCpu = Math.max(0, Math.round(cpus)) * 256;
  const reserve = Math.max(1024, fromRam, fromCpu);
  const cap = Math.max(512, Math.floor(memoryMbValue * 0.5));
  return Math.min(reserve, cap);
}

export function specsFromCoolify(payload: unknown): StoredServerSpecs | null {
  const server = asRecord(payload);
  if (!server) return null;
  const meta = asRecord(server.server_metadata) ?? {};
  const settings = asRecord(server.settings) ?? {};
  const ram = memoryMb(meta.memory_bytes) || memoryMb(meta.memory) || memoryMb(server.memory_bytes);
  if (ram < 512) return null;
  const disk = memoryMb(meta.disk_bytes) || memoryMb(meta.disk_total_bytes) || memoryMb(server.disk_bytes);
  const reachable = settings.is_reachable;
  return {
    source: "coolify",
    memoryMb: ram,
    cpus: Math.max(0, Math.round(numberOf(meta.cpus) || numberOf(server.cpus))),
    os: text(meta.os),
    arch: text(meta.arch),
    kernel: text(meta.kernel),
    docker: text(settings.docker_version) || text(meta.docker),
    name: text(server.name),
    reachable: typeof reachable === "boolean" ? reachable : null,
    collectedAt: text(meta.collected_at) || new Date().toISOString(),
    diskMb: disk >= 512 ? disk : null,
  };
}

export function parseStoredSpecs(raw: string): StoredServerSpecs | null {
  if (!raw) return null;
  const parsed = specsFromCoolify(raw);
  const record = asRecord(raw);
  if (!record) return null;
  const source = record.source === "coolify" || record.source === "manual" ? record.source : parsed ? "coolify" : null;
  const memory = numberOf(record.memoryMb) || parsed?.memoryMb || 0;
  if (!source || memory < 512) return null;
  return {
    source,
    memoryMb: Math.round(memory),
    cpus: Math.max(0, Math.round(numberOf(record.cpus))),
    os: text(record.os),
    arch: text(record.arch),
    kernel: text(record.kernel),
    docker: text(record.docker),
    name: text(record.name),
    reachable: typeof record.reachable === "boolean" ? record.reachable : null,
    collectedAt: text(record.collectedAt),
    diskMb: numberOf(record.diskMb) >= 512 ? Math.round(numberOf(record.diskMb)) : null,
  };
}

export function manualSpecs(input: { name: string; memoryMb: number }): StoredServerSpecs {
  return {
    source: "manual",
    memoryMb: Math.round(input.memoryMb),
    cpus: 0,
    os: "",
    arch: "",
    kernel: "",
    docker: "",
    name: input.name,
    reachable: null,
    collectedAt: new Date().toISOString(),
    diskMb: null,
  };
}
