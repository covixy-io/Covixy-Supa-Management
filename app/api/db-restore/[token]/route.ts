import { readFileSync } from "node:fs";
import { findRestoreByToken } from "@/lib/cloud-import";

export async function GET(_request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const file = findRestoreByToken(token);
  if (!file) return new Response("Not found", { status: 404 });
  const body = readFileSync(file);
  return new Response(body, {
    headers: {
      "Content-Type": "application/sql; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
