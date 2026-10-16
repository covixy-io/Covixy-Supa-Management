import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { panelDataDir } from "@/lib/db";

const globalKey = globalThis as unknown as { __csmKey?: Buffer; __csmKeySource?: "volume" | "env" | "dev-file" };

function readKey(file: string): Buffer | null {
  try {
    const key = Buffer.from(readFileSync(file, "utf8").trim(), "base64");
    return key.length === 32 ? key : null;
  } catch {
    return null;
  }
}

function volumeKeyPath(): string {
  return path.join(panelDataDir(), "encryption.key");
}

function remember(key: Buffer, source: "volume" | "env" | "dev-file"): Buffer {
  globalKey.__csmKey = key;
  globalKey.__csmKeySource = source;
  return key;
}

function saveVolumeKey(key: Buffer): void {
  const file = volumeKeyPath();
  if (readKey(file)) return;
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, key.toString("base64"), { mode: 0o600 });
}

function encryptionKey(): Buffer {
  if (globalKey.__csmKey) return globalKey.__csmKey;

  const saved = readKey(volumeKeyPath());
  if (saved) return remember(saved, "volume");

  const legacy = readKey(path.join(process.cwd(), "data", "dev-encryption.key"));
  if (legacy) {
    saveVolumeKey(legacy);
    return remember(legacy, "dev-file");
  }

  const fromEnv = process.env.PANEL_ENCRYPTION_KEY;
  if (fromEnv) {
    const key = Buffer.from(fromEnv, "base64");
    if (key.length !== 32) throw new Error("PANEL_ENCRYPTION_KEY must be 32 bytes, base64-encoded.");
    saveVolumeKey(key);
    return remember(key, "env");
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error("Set PANEL_ENCRYPTION_KEY before running in production.");
  }

  const key = randomBytes(32);
  saveVolumeKey(key);
  return remember(key, "dev-file");
}

export function encryptionKeySource(): "volume" | "env" | "dev-file" {
  encryptionKey();
  return globalKey.__csmKeySource || "dev-file";
}

export function encryptionKeyDiffersFromEnv(): boolean {
  const fromEnv = process.env.PANEL_ENCRYPTION_KEY;
  if (!fromEnv) return false;
  const envKey = Buffer.from(fromEnv, "base64");
  if (envKey.length !== 32) return false;
  return !encryptionKey().equals(envKey);
}

export function encryptJson(value: unknown): { ciphertext: string; nonce: string } {
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), nonce);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  const packed = Buffer.concat([encrypted, cipher.getAuthTag()]);
  return { ciphertext: packed.toString("base64"), nonce: nonce.toString("base64") };
}

export function decryptJson<T>(ciphertext: string, nonce: string): T {
  const packed = Buffer.from(ciphertext, "base64");
  const tag = packed.subarray(packed.length - 16);
  const encrypted = packed.subarray(0, packed.length - 16);
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(nonce, "base64"));
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
  return JSON.parse(plaintext) as T;
}

export function resetEncryptionKeyForTests(): void {
  globalKey.__csmKey = undefined;
  globalKey.__csmKeySource = undefined;
}
