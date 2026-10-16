import { randomBytes } from "node:crypto";
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { decryptJson, encryptJson } from "@/lib/crypto";
import { panelDataDir } from "@/lib/db";

export type ImportPlan = {
  connectionString?: string;
  sourceApiUrl: string;
  panelBaseUrl: string;
  token: string;
  dumped?: boolean;
  storageCopied?: boolean;
  storageFailures?: number;
};

function dir(): string {
  const folder = path.join(panelDataDir(), "imports");
  mkdirSync(folder, { recursive: true });
  return folder;
}

function planPath(projectId: string): string {
  return path.join(dir(), `${projectId}.json`);
}

export function restoreSqlPath(projectId: string): string {
  return path.join(dir(), `${projectId}.sql`);
}

export function saveImportPlan(projectId: string, plan: ImportPlan): void {
  const packed = encryptJson(plan);
  writeFileSync(planPath(projectId), JSON.stringify(packed), { mode: 0o600 });
}

export function readImportPlan(projectId: string): ImportPlan | null {
  try {
    const packed = JSON.parse(readFileSync(planPath(projectId), "utf8")) as { ciphertext: string; nonce: string };
    return decryptJson<ImportPlan>(packed.ciphertext, packed.nonce);
  } catch {
    return null;
  }
}

export function newImportToken(): string {
  return randomBytes(32).toString("base64url");
}

export function findRestoreByToken(token: string): string | null {
  let names: string[] = [];
  try {
    names = readdirSync(dir());
  } catch {
    return null;
  }
  for (const name of names) {
    if (!name.endsWith(".json")) continue;
    const projectId = name.slice(0, -".json".length);
    const plan = readImportPlan(projectId);
    if (plan?.token === token && plan.dumped) return restoreSqlPath(projectId);
  }
  return null;
}

export function deleteImportFiles(projectId: string): void {
  rmSync(planPath(projectId), { force: true });
  rmSync(restoreSqlPath(projectId), { force: true });
}
