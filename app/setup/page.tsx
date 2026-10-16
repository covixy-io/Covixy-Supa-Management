import { redirect } from "next/navigation";
import { SetupWizard } from "@/components/setup-wizard";
import { isInstalled } from "@/lib/settings";

export const dynamic = "force-dynamic";

export default function SetupPage() {
  if (isInstalled()) redirect("/projects");
  return <SetupWizard />;
}
