const encoder = new TextEncoder();

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function base64UrlToBytes(value: string): Uint8Array {
  const padded = value + "=".repeat((4 - (value.length % 4)) % 4);
  const binary = atob(padded.replaceAll("-", "+").replaceAll("_", "/"));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function hmac(secret: string, value: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(value));
  return new Uint8Array(signature);
}

function sameString(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function sessionSecret(): string {
  const secret = process.env.PANEL_SESSION_SECRET || process.env.PANEL_ENCRYPTION_KEY;
  if (secret) return secret;
  if (!process.env.PANEL_PASSWORD) return "dev-only-session-secret";
  throw new Error("Set PANEL_SESSION_SECRET before setting PANEL_PASSWORD.");
}

export async function signSession(secret: string, ttlSeconds = 60 * 60 * 24 * 14): Promise<string> {
  const body = bytesToBase64Url(
    encoder.encode(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + ttlSeconds })),
  );
  const signature = bytesToBase64Url(await hmac(secret, body));
  return `${body}.${signature}`;
}

export async function verifySession(token: string, secret: string): Promise<boolean> {
  const [body, signature] = token.split(".");
  if (!body || !signature) return false;
  const expected = bytesToBase64Url(await hmac(secret, body));
  if (!sameString(expected, signature)) return false;
  try {
    const payload = JSON.parse(new TextDecoder().decode(base64UrlToBytes(body))) as { exp?: number };
    return typeof payload.exp === "number" && payload.exp > Date.now() / 1000;
  } catch {
    return false;
  }
}
