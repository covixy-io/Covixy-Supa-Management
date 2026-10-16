import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const globalKey = globalThis as unknown as { __csmKey?: Buffer };

function encryptionKey(): Buffer {
  if (globalKey.__csmKey) return globalKey.__csmKey;

  const fromEnv = process.env.PANEL_ENCRYPTION_KEY;
  if (fromEnv) {
    const key = Buffer.from(fromEnv, "base64");
    if (key.length !== 32) {
      throw new Error("PANEL_ENCRYPTION_KEY must be 32 bytes, base64-encoded.");
    }
    globalKey.__csmKey = key;
    return key;
  }

  const file = path.join(process.cwd(), "data", "dev-encryption.key");
  try {
    const key = Buffer.from(readFileSync(file, "utf8").trim(), "base64");
    if (key.length === 32) {
      globalKey.__csmKey = key;
      return key;
    }
  } catch {
    // A local run can create a dev key. Production must set PANEL_ENCRYPTION_KEY.
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error("Set PANEL_ENCRYPTION_KEY before running in production.");
  }

  const key = randomBytes(32);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, key.toString("base64"));
  globalKey.__csmKey = key;
  return key;
}

export function encryptionKeySource(): "env" | "dev-file" {
  return process.env.PANEL_ENCRYPTION_KEY ? "env" : "dev-file";
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
}
