import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifySession } from "@/lib/session";
import { passwordConfigured, serverSessionSecret } from "@/lib/settings";

export const SESSION_COOKIE = "csm_session";
export const LOCK_COOKIE = "csm_lock";

export function passwordEnabled(): boolean {
  return passwordConfigured();
}

export async function assertPanelAccess(): Promise<void> {
  if (!passwordEnabled()) return;
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token || !(await verifySession(token, serverSessionSecret()))) redirect("/login");
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 14,
  };
}
