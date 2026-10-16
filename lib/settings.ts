import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { getDb } from "@/lib/db";
import { decryptJson, encryptJson } from "@/lib/crypto";
import { validateApex } from "@/lib/hosts";
import { manualSpecs, reserveFromSpecs, SPECS_KEY } from "@/lib/server-specs";

export type SetupInput = {
  apexDomain: string;
  serverName: string;
  serverRamMb: number;
  serverReserveMb: number;
  password: string;
  coolifyApiUrl: string;
  coolifyApiToken: string;
  coolifyProjectUuid: string;
  coolifyServerUuid: string;
  coolifyEnvironmentName: string;
};

export class SetupError extends Error {}

export function getSetting(key: string): string {
  const row = getDb().prepare("SELECT value FROM panel_settings WHERE key = ?").get(key) as
    | { value: string }
    | undefined;
  return row?.value ?? "";
}

export function setSetting(key: string, value: string): void {
  getDb()
    .prepare(
      "INSERT INTO panel_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    )
    .run(key, value);
}

export function isInstalled(): boolean {
  return getSetting("installed") === "1";
}

export function panelApex(): string {
  return (process.env.APEX_DOMAIN || getSetting("apex_domain") || "covixy.com").trim().toLowerCase();
}

export function configuredNumber(key: string, fallback: number): number {
  const raw = getSetting(key);
  const value = Number(raw);
  return raw && Number.isFinite(value) ? value : fallback;
}

export function serverName(): string {
  return process.env.SERVER_NAME || getSetting("server_name") || "primary";
}

export function coolifyToken(): string {
  if (process.env.COOLIFY_API_TOKEN) return process.env.COOLIFY_API_TOKEN;
  const ciphertext = getSetting("coolify_token_ciphertext");
  const nonce = getSetting("coolify_token_nonce");
  if (!ciphertext || !nonce) return "";
  return decryptJson<string>(ciphertext, nonce);
}

export function coolifyConfig() {
  return {
    url: process.env.COOLIFY_API_URL || getSetting("coolify_api_url"),
    token: coolifyToken(),
    project: process.env.COOLIFY_PROJECT_UUID || getSetting("coolify_project_uuid"),
    server: process.env.COOLIFY_SERVER_UUID || getSetting("coolify_server_uuid"),
    environment: process.env.COOLIFY_ENVIRONMENT_NAME || getSetting("coolify_environment_name") || "production",
    destination: process.env.COOLIFY_DESTINATION_UUID || getSetting("coolify_destination_uuid"),
  };
}

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("base64");
  const hash = scryptSync(password, salt, 32).toString("base64");
  return `${salt}:${hash}`;
}

function verifyHash(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const next = scryptSync(password, salt, 32);
  const previous = Buffer.from(hash, "base64");
  if (next.length !== previous.length) return false;
  return timingSafeEqual(next, previous);
}

export function passwordConfigured(): boolean {
  return Boolean(process.env.PANEL_PASSWORD || getSetting("password_hash"));
}

export function verifyPanelPassword(password: string): boolean {
  const env = process.env.PANEL_PASSWORD;
  if (env) {
    const left = Buffer.from(password);
    const right = Buffer.from(env);
    if (left.length !== right.length) return false;
    return timingSafeEqual(left, right);
  }
  const stored = getSetting("password_hash");
  if (!stored) return false;
  return verifyHash(password, stored);
}

export function serverSessionSecret(): string {
  const fromEnv = process.env.PANEL_SESSION_SECRET || process.env.PANEL_ENCRYPTION_KEY;
  if (fromEnv) return fromEnv;
  const stored = getSetting("session_secret");
  if (stored) return stored;
  if (!passwordConfigured()) return "dev-only-session-secret";
  throw new Error("Set PANEL_SESSION_SECRET before setting PANEL_PASSWORD.");
}

export function completeSetup(input: SetupInput): { lock: boolean } {
  if (isInstalled()) throw new SetupError("This panel is already set up.");
  const apex = input.apexDomain.trim().toLowerCase();
  const apexError = validateApex(apex);
  if (apexError) throw new SetupError(apexError);
  const name = input.serverName.trim() || "primary";
  if (!Number.isFinite(input.serverRamMb) || input.serverRamMb < 2048) {
    throw new SetupError("Server RAM should be at least 2048 MB.");
  }
  const reserveMb = reserveFromSpecs(input.serverRamMb, 0);
  if (reserveMb >= input.serverRamMb) {
    throw new SetupError("The server needs more RAM than the reserve for the OS, Docker, and the Coolify proxy.");
  }
  if (input.password && input.password.length < 8) {
    throw new SetupError("Use at least 8 characters for the panel password, or leave it empty on this machine.");
  }

  const coolifyFields = [input.coolifyApiUrl, input.coolifyApiToken, input.coolifyProjectUuid, input.coolifyServerUuid];
  const filled = coolifyFields.filter((value) => value.trim()).length;
  if (filled > 0 && filled < coolifyFields.length) {
    throw new SetupError("Fill the Coolify URL, token, project, and server, or leave all of them empty.");
  }

  setSetting("apex_domain", apex);
  setSetting("server_name", name);
  const ramMb = Math.round(input.serverRamMb);
  setSetting("server_ram_mb", String(ramMb));
  setSetting("server_reserve_mb", String(reserveMb));
  setSetting(SPECS_KEY, JSON.stringify(manualSpecs({ name, memoryMb: ramMb })));
  if (input.password) {
    setSetting("password_hash", hashPassword(input.password));
    setSetting("session_secret", randomBytes(32).toString("base64url"));
  }
  if (filled === coolifyFields.length) {
    setSetting("coolify_api_url", input.coolifyApiUrl.trim().replace(/\/$/, ""));
    setSetting("coolify_project_uuid", input.coolifyProjectUuid.trim());
    setSetting("coolify_server_uuid", input.coolifyServerUuid.trim());
    setSetting("coolify_environment_name", input.coolifyEnvironmentName.trim() || "production");
    const packed = encryptJson(input.coolifyApiToken.trim());
    setSetting("coolify_token_ciphertext", packed.ciphertext);
    setSetting("coolify_token_nonce", packed.nonce);
  }
  setSetting("installed", "1");
  return { lock: Boolean(input.password) };
}
