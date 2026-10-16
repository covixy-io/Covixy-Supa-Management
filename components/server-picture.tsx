import type { ProjectLoad } from "@/lib/analytics";
import type { StoredServerSpecs } from "@/lib/server-specs";

function pct(value: number): string {
  if (!Number.isFinite(value) || value < 0) return "0%";
  return `${Math.round(value * 100)}%`;
}

export function ServerPicture({
  serverRamMb,
  reserveMb,
  usedMb,
  freeMb,
  specs,
  reserveBasis,
  projects,
}: {
  serverRamMb: number;
  reserveMb: number;
  usedMb: number;
  freeMb: number;
  specs: StoredServerSpecs | null;
  reserveBasis: "env" | "coolify" | "estimated";
  projects: ProjectLoad[];
}) {
  const span = Math.max(serverRamMb, reserveMb + usedMb, 1);
  const reservePct = (Math.max(0, reserveMb) / span) * 100;
  const loadPct = (Math.max(0, usedMb) / span) * 100;
  const overflow = Math.max(0, reserveMb + usedMb - serverRamMb);
  const ring = `conic-gradient(var(--muted) 0 ${reservePct}%, var(--blue) ${reservePct}% ${reservePct + loadPct}%, var(--blue-soft) ${reservePct + loadPct}% 100%)`;
  const cpus = specs?.cpus ?? 0;
  const basis =
    reserveBasis === "coolify"
      ? `Reserved from the Coolify server specs${cpus ? ` (${cpus} CPU${cpus === 1 ? "" : "s"})` : ""}.`
      : reserveBasis === "env"
        ? "Reserved from SERVER_RESERVE_MB."
        : "Coolify has not reported this server's specs yet, so the reserve is estimated from the RAM on file.";

  return (
    <div className="card p-5">
      <div className="flex flex-col gap-6 md:flex-row md:items-center">
        <div className="grid h-40 w-40 shrink-0 place-items-center rounded-full" style={{ background: ring }}>
          <div className="bg-surface grid h-24 w-24 place-items-center rounded-full text-center">
            <span className="text-xl leading-none font-bold">{pct(usedMb / Math.max(serverRamMb, 1))}</span>
            <span className="text-muted text-xs">of the server</span>
          </div>
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">Whole server</p>
          <p className="text-muted mt-1 text-sm">{basis}</p>
          <div className="bg-blue-soft mt-4 flex h-4 overflow-hidden rounded-full">
            <div className="bg-muted h-4" style={{ width: `${reservePct}%` }} />
            <div className="bg-blue h-4" style={{ width: `${loadPct}%` }} />
          </div>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs">
            <span className="inline-flex items-center gap-1.5">
              <span className="bg-muted h-2 w-2 rounded-full" />
              Reserved {reserveMb} MB
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="bg-blue h-2 w-2 rounded-full" />
              Project load {usedMb} MB
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="bg-blue-soft border-line h-2 w-2 rounded-full border" />
              Headroom {Math.max(0, freeMb)} MB
            </span>
          </div>
          {overflow > 0 ? <p className="text-danger mt-2 text-sm">Load and reserve together exceed the server by {overflow} MB.</p> : null}
        </div>
      </div>

      <dl className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["RAM", `${serverRamMb} MB`],
          cpus ? ["CPUs", String(cpus)] : null,
          specs?.diskMb ? ["Disk", `${specs.diskMb} MB`] : null,
          specs?.docker ? ["Docker", specs.docker] : null,
          specs?.os ? ["OS", specs.os] : null,
          specs?.arch ? ["Arch", specs.arch] : null,
          specs?.kernel ? ["Kernel", specs.kernel] : null,
          specs?.source === "coolify" && specs.name ? ["Coolify server", specs.name] : null,
        ]
          .filter((item): item is [string, string] => Boolean(item))
          .map(([label, value]) => (
            <Spec key={label} label={label} value={value} />
          ))}
      </dl>
      {specs?.reachable !== null && specs?.reachable !== undefined ? (
        <p className={`mt-3 text-sm ${specs.reachable ? "text-blue" : "text-warn"}`}>
          {specs.reachable ? "Coolify can reach this server." : "Coolify reports this server as unreachable."}
        </p>
      ) : null}

      <div className="mt-6 space-y-3">
        {projects.length === 0 ? <p className="text-muted text-sm">No projects yet.</p> : null}
        {projects.map((project) => {
          const width = Math.max(0, Math.min(100, (project.loadMb / span) * 100));
          return (
            <div key={project.id}>
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="font-medium">{project.name}</span>
                <span className="text-muted">
                  {project.loadMb} MB · {pct(project.loadMb / Math.max(serverRamMb, 1))} of the server
                </span>
              </div>
              <div className="bg-blue-soft mt-1 h-2 overflow-hidden rounded-full">
                <div className="bg-blue h-2 rounded-full" style={{ width: `${width}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Spec({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-bg rounded-lg px-3 py-2">
      <dt className="text-muted text-xs">{label}</dt>
      <dd className="mt-0.5 text-sm font-semibold break-all">{value}</dd>
    </div>
  );
}
