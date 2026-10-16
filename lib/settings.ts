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

export function envCompletesInstall(): boolean {
  return Boolean(
    process.env.COOLIFY_API_URL?.trim() &&
      process.env.COOLIFY_API_TOKEN?.trim() &&
      process.env.COOLIFY_PROJECT_UUID?.trim() &&
      process.env.COOLIFY_SERVER_UUID?.trim(),
  );
}

function adoptInstallFromEnv(): void {
  if (getSetting("installed") === "1") return;
  const apex = process.env.APEX_DOMAIN?.trim().toLowerCase();
  const url = process.env.COOLIFY_API_URL?.trim().replace(/\/+$/, "");
  const project = process.env.COOLIFY_PROJECT_UUID?.trim();
  const server = process.env.COOLIFY_SERVER_UUID?.trim();
  const environment = process.env.COOLIFY_ENVIRONMENT_NAME?.trim();
  const name = process.env.SERVER_NAME?.trim();
  if (apex && !getSetting("apex_domain")) setSetting("apex_domain", apex);
  if (url && !getSetting("coolify_api_url")) setSetting("coolify_api_url", url);
  if (project && !getSetting("coolify_project_uuid")) setSetting("coolify_project_uuid", project);
  if (server && !getSetting("coolify_server_uuid")) setSetting("coolify_server_uuid", server);
  if (environment && !getSetting("coolify_environment_name")) setSetting("coolify_environment_name", environment);
  if (name && !getSetting("server_name")) setSetting("server_name", name);
  const token = normalizeCoolifyToken(process.env.COOLIFY_API_TOKEN || "");
  if (token && !getSetting("coolify_token_ciphertext")) {
    try {
      const packed = encryptJson(token);
      setSetting("coolify_token_ciphertext", packed.ciphertext);
      setSetting("coolify_token_nonce", packed.nonce);
    } catch {
      // The environment variable still supplies the token on this boot.
    }
  }
  setSetting("installed", "1");
}

export function isInstalled(): boolean {
  if (getSetting("installed") === "1") return true;
  if (!envCompletesInstall()) return false;
  adoptInstallFromEnv();
  return true;
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

export function normalizeCoolifyToken(raw: string): string {
  let token = raw.trim();
  for (let pass = 0; pass < 3; pass += 1) {
    const unquoted =
      token.length >= 2 &&
      ((token.startsWith('"') && token.endsWith('"')) || (token.startsWith("'") && token.endsWith("'")))
        ? token.slice(1, -1).trim()
        : token;
    const next = unquoted.replace(/^Bearer\s+/i, "").trim();
    if (next === token) break;
    token = next;
  }
  return token.replace(/\s+/g, "");
}

export function coolifyOverrides() {
  return {
    url: Boolean(process.env.COOLIFY_API_URL),
    token: Boolean(process.env.COOLIFY_API_TOKEN),
    project: Boolean(process.env.COOLIFY_PROJECT_UUID),
    server: Boolean(process.env.COOLIFY_SERVER_UUID),
    environment: Boolean(process.env.COOLIFY_ENVIRONMENT_NAME),
  };
}

export function updateCoolifyConnection(input: {
  url: string;
  token: string;
  project: string;
  server: string;
  environment: string;
}): void {
  const locked = coolifyOverrides();
  if (locked.url && locked.token && locked.project && locked.server) {
    throw new SetupError(
      "Coolify is set from environment variables. Change COOLIFY_API_TOKEN where this panel runs, keep the full token including the vertical bar, and redeploy.",
    );
  }
  if (locked.token && input.token.trim()) {
    throw new SetupError(
      "COOLIFY_API_TOKEN is set where this panel runs, so this page cannot replace it. Edit that variable, keep the full token including the vertical bar, and redeploy.",
    );
  }

  const current = coolifyConfig();
  const url = (locked.url ? current.url : input.url).trim().replace(/\/$/, "");
  const project = (locked.project ? current.project : input.project).trim();
  const server = (locked.server ? current.server : input.server).trim();
  const environment = (locked.environment ? current.environment : input.environment).trim() || "production";
  const token = locked.token || !input.token.trim() ? current.token : normalizeCoolifyToken(input.token);

  if (!url || !token || !project || !server) {
    throw new SetupError("Fill the Coolify URL, token, project, and server.");
  }
  if (!/^https?:\/\//i.test(url)) throw new SetupError("Coolify URL should start with https://.");
  if (!token.includes("|")) {
    throw new SetupError(
      locked.token
        ? "COOLIFY_API_TOKEN is missing the vertical bar. Set the whole token, like 4|secret, where this panel runs, and redeploy."
        : "Paste the whole API token from Keys & Tokens. It looks like 4|secret, with a number, a vertical bar, and the secret.",
    );
  }

  if (!locked.url) setSetting("coolify_api_url", url);
  if (!locked.project) setSetting("coolify_project_uuid", project);
  if (!locked.server) setSetting("coolify_server_uuid", server);
  if (!locked.environment) setSetting("coolify_environment_name", environment);
  if (!locked.token && input.token.trim()) {
    const packed = encryptJson(token);
    setSetting("coolify_token_ciphertext", packed.ciphertext);
    setSetting("coolify_token_nonce", packed.nonce);
  }
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
