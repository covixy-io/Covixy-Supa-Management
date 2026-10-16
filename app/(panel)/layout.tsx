import { redirect } from "next/navigation";
import { Shell } from "@/components/shell";
import { assertPanelAccess } from "@/lib/auth";
import { isInstalled } from "@/lib/settings";

export const dynamic = "force-dynamic";

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  if (!isInstalled()) redirect("/setup");
  await assertPanelAccess();
  return <Shell>{children}</Shell>;
}
