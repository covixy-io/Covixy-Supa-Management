import { createHmac, randomBytes } from "node:crypto";

export type StackSecrets = {
  jwtSecret: string;
  anonKey: string;
  serviceRoleKey: string;
  postgresPassword: string;
  secretKeyBase: string;
  pgMetaCryptoKey: string;
  realtimeDbEncKey: string;
  dashboardUsername: string;
  dashboardPassword: string;
  s3ProtocolAccessKeyId: string;
  s3ProtocolAccessKeySecret: string;
};

function token(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function signJwt(payload: Record<string, unknown>, secret: string): string {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const data = `${header}.${body}`;
  const signature = createHmac("sha256", secret).update(data).digest("base64url");
  return `${data}.${signature}`;
}

export function decodeJwtPayload(tokenValue: string): Record<string, unknown> {
  const part = tokenValue.split(".")[1];
  if (!part) throw new Error("JWT is missing a payload.");
  return JSON.parse(Buffer.from(part, "base64url").toString("utf8")) as Record<string, unknown>;
}

export function generateStackSecrets(): StackSecrets {
  const jwtSecret = token(40);
  const issuedAt = Math.floor(Date.now() / 1000);
  const expiresAt = issuedAt + 60 * 60 * 24 * 365 * 10;
  const claims = (role: "anon" | "service_role") => ({
    role,
    iss: "supabase",
    iat: issuedAt,
    exp: expiresAt,
  });

  return {
    jwtSecret,
    anonKey: signJwt(claims("anon"), jwtSecret),
    serviceRoleKey: signJwt(claims("service_role"), jwtSecret),
    postgresPassword: token(24),
    secretKeyBase: token(64),
    pgMetaCryptoKey: token(32),
    realtimeDbEncKey: token(32),
    dashboardUsername: "supabase",
    dashboardPassword: token(24),
    s3ProtocolAccessKeyId: token(16),
    s3ProtocolAccessKeySecret: token(32),
  };
}

export function scrubSecrets(text: string, values: string[]): string {
  const secrets = [...values].filter((value) => value.length >= 20).sort((a, b) => b.length - a.length);
  return secrets.reduce((output, secret) => output.split(secret).join("[redacted]"), text);
}
