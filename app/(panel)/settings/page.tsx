import { existsSync } from "node:fs";
import { CoolifyCheck } from "@/components/coolify-check";
import { CoolifySettings } from "@/components/coolify-settings";
import { PageHeader } from "@/components/page-header";
import { passwordEnabled } from "@/lib/auth";
import { encryptionKeyDiffersFromEnv, encryptionKeySource } from "@/lib/crypto";
import { dbFilePath } from "@/lib/db";
import { coolifyMode } from "@/lib/coolify";
import { refreshSpecsAction } from "@/app/actions";
import { serverReserveMb, serverSpecs } from "@/lib/projects";
import { coolifyConfig, coolifyOverrides, isInstalled, panelApex, serverName } from "@/lib/settings";
import { TEMPLATE } from "@/lib/template";

function connectionState(filled: boolean, fromEnv: boolean): "empty" | "saved" | "environment" {
  if (fromEnv) return "environment";
  return filled ? "saved" : "empty";
}

function Flag({ label, state }: { label: string; state: "empty" | "saved" | "environment" }) {
  const text = state === "environment" ? "From environment" : state === "saved" ? "Saved" : "Empty";
  return (
    <div className="border-line flex items-center justify-between gap-4 border-b py-2 text-sm last:border-0">
      <span>{label}</span>
      <span className={state === "empty" ? "text-muted" : "font-semibold text-blue"}>{text}</span>
    </div>
  );
}

export default function SettingsPage() {
  const mode = coolifyMode();
  const coolify = coolifyConfig();
  const overrides = coolifyOverrides();
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
      <div className="bg-warn-soft text-warn mt-4 rounded-xl px-4 py-3 text-sm">
        <p>
          Restart, Redeploy, and Deploy keep the Coolify environment variables, so this panel stays set up when the apex
          and Coolify connection are already in that environment. Each Supabase stack is its own Coolify service named
          supa- and keeps running, including its database. This panel attaches those services again after a fresh container.
        </p>
        <p className="mt-2">
          This panel’s copy of those keys is the database at <span className="font-mono">{dbFilePath()}</span>
          {existsSync(dbFilePath()) ? "" : " (not created yet)"}. That folder has to be a persistent volume mounted at{" "}
          <span className="font-mono">/app/data</span>. A redeploy without that volume starts from an empty database, so
          the keys look gone. The encryption key is saved in that same folder and is kept even if Coolify generates a
          new <span className="font-mono">PANEL_ENCRYPTION_KEY</span>.
          {encryptionKeyDiffersFromEnv()
            ? " The environment key does not match the saved key. This panel keeps the saved key so existing projects stay readable."
            : ""}
        </p>
      </div>
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
        <Flag label="Coolify URL" state={connectionState(Boolean(coolify.url), overrides.url)} />
        <Flag label="Coolify token" state={connectionState(Boolean(coolify.token), overrides.token)} />
        <Flag label="Coolify project" state={connectionState(Boolean(coolify.project), overrides.project)} />
        <Flag label="Coolify server" state={connectionState(Boolean(coolify.server), overrides.server)} />
        <Flag label="Panel password" state={passwordEnabled() ? "saved" : "empty"} />
        <Flag label="Encryption key" state={encryptionKeySource() === "env" ? "environment" : "saved"} />
      </div>
      <CoolifySettings
        url={coolify.url}
        project={coolify.project}
        server={coolify.server}
        environment={coolify.environment}
        hasToken={Boolean(coolify.token)}
        locked={overrides}
      />
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
