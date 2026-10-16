import { CoolifyCheck } from "@/components/coolify-check";
import { PageHeader } from "@/components/page-header";
import { passwordEnabled } from "@/lib/auth";
import { encryptionKeySource } from "@/lib/crypto";
import { coolifyMode } from "@/lib/coolify";
import { refreshSpecsAction } from "@/app/actions";
import { serverReserveMb, serverSpecs } from "@/lib/projects";
import { coolifyConfig, isInstalled, panelApex, serverName } from "@/lib/settings";
import { TEMPLATE } from "@/lib/template";

function Flag({ on, label }: { on: boolean; label: string }) {
  return (
    <div className="border-line flex items-center justify-between gap-4 border-b py-2 text-sm last:border-0">
      <span>{label}</span>
      <span className={on ? "font-semibold text-blue" : "text-muted"}>{on ? "Set" : "Empty"}</span>
    </div>
  );
}

export default function SettingsPage() {
  const mode = coolifyMode();
  const coolify = coolifyConfig();
  const specs = serverSpecs();

  return (
    <div className="max-w-2xl">
      <PageHeader title="Settings" lede="The zone, server size, and Coolify connection for this installation." />

      <h2 className="mt-8 text-sm font-semibold">This installation</h2>
      <dl className="card mt-3 space-y-3 p-4 text-sm">
        <div className="flex justify-between gap-4">
          <dt className="text-muted">Setup</dt>
          <dd>{isInstalled() ? "Complete" : "Not finished"}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-muted">Zone</dt>
          <dd className="font-mono text-xs">{panelApex()}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-muted">Server</dt>
          <dd>{specs?.name || serverName()}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-muted">RAM</dt>
          <dd>{specs ? `${specs.memoryMb} MB from ${specs.source === "coolify" ? "Coolify" : "setup"}` : "Default until specs arrive"}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-muted">Reserved</dt>
          <dd>{serverReserveMb()} MB</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-muted">CPUs</dt>
          <dd>{specs?.cpus ? specs.cpus : "Not reported"}</dd>
        </div>
        <div>
          <dt className="text-muted">Hostnames</dt>
          <dd className="mt-1">
            {"{slug}"}
            .{panelApex()} for the API and {"{slug}"}-studio.{panelApex()} for Studio.
          </dd>
        </div>
      </dl>
      <form action={refreshSpecsAction} className="mt-3">
        <button type="submit" className="btn btn-ghost">
          Refresh server specs
        </button>
      </form>

      <h2 className="mt-8 text-sm font-semibold">Template</h2>
      <p className="mt-3 text-sm">
        {TEMPLATE.id} {TEMPLATE.version}, Postgres {TEMPLATE.postgresMajor}, {TEMPLATE.containers} containers,{" "}
        {TEMPLATE.ramMb} MB estimate.
      </p>
      <p className="text-muted mt-2 text-sm">{TEMPLATE.notes}</p>

      <h2 className="mt-8 text-sm font-semibold">Connection</h2>
      <div className="card mt-3 px-4">
        <Flag on={Boolean(coolify.url)} label="Coolify URL" />
        <Flag on={Boolean(coolify.token)} label="Coolify token" />
        <Flag on={Boolean(coolify.project)} label="Coolify project" />
        <Flag on={Boolean(coolify.server)} label="Coolify server" />
        <Flag on={passwordEnabled()} label="Panel password" />
        <Flag on={encryptionKeySource() === "env"} label="Encryption key from env" />
      </div>
      <p className="mt-4 text-sm">Mode is {mode}.</p>
      <CoolifyCheck />

      <h2 className="mt-8 text-sm font-semibold">Still ahead</h2>
      <p className="text-muted mt-3 text-sm">
        Config for auth providers and SMTP, live container metrics, Studio behind Cloudflare Access, and database
        branching. Backups are not built yet. One server is still a single point of failure.
      </p>
    </div>
  );
}
