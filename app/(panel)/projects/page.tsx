import Link from "next/link";
import { ArrowUpRight, Download, Plus } from "lucide-react";
import { LeftoverServices } from "@/components/leftover-services";
import { LiveRefresh } from "@/components/live-refresh";
import { PageHeader } from "@/components/page-header";
import { RemoveProject } from "@/components/remove-project";
import { RestoreProject } from "@/components/restore-project";
import { isBusy, StatusLamp } from "@/components/status-lamp";
import { projectAnalytics } from "@/lib/analytics";
import { coolifyMode, leftoverServices, listServices, type LeftoverService } from "@/lib/coolify";
import { formatWhen } from "@/lib/format";
import { TEMPLATE } from "@/lib/template";

function pct(value: number): string {
  return `${Math.round(value * 100)}%`;
}

export default async function ProjectsPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const query = await searchParams;
  const room = projectAnalytics();
  const projects = room.projects;
  const mode = coolifyMode();
  let leftovers: LeftoverService[] = [];
  if (mode === "live") {
    try {
      leftovers = leftoverServices(
        await listServices(),
        projects.map((project) => ({ slug: project.slug, coolifyServiceUuid: project.coolifyServiceUuid })),
      );
    } catch {
      leftovers = [];
    }
  }

  return (
    <div>
      <LiveRefresh active={projects.some((project) => isBusy(project.status))} />
      <PageHeader
        title="Projects"
        lede="Each project is one Supabase stack. Download an offline copy before you delete one, and restore that file here when you want it back."
      >
        <RestoreProject />
        <Link href="/projects/new" className="btn btn-primary">
          <Plus size={16} />
          New project
        </Link>
      </PageHeader>
      {query.error ? <p className="bg-warn-soft text-warn mt-5 rounded-xl px-4 py-3 text-sm">{query.error}</p> : null}
      {mode === "rehearsal" ? (
        <p className="bg-warn-soft text-warn mt-5 rounded-xl px-4 py-3 text-sm">
          Rehearsal mode. Projects are saved here, and Coolify calls wait until the API URL, token, project, and server are set.
        </p>
      ) : null}
      <div className="mt-4 grid gap-3 sm:grid-cols-4">
        <div className="card p-4">
          <p className="text-muted text-xs font-medium">Projects</p>
          <p className="mt-1 text-2xl font-bold">{projects.length}</p>
          <p className="text-muted text-xs">{room.activeStacks} counting toward load</p>
        </div>
        <div className="card p-4">
          <p className="text-muted text-xs font-medium">Each stack</p>
          <p className="mt-1 text-2xl font-bold">{room.stackRamMb} MB</p>
          <p className="text-muted text-xs">{TEMPLATE.containers} containers while it is running</p>
        </div>
        <div className="card p-4">
          <p className="text-muted text-xs font-medium">Load</p>
          <p className="mt-1 text-2xl font-bold">{room.usedMb} MB</p>
          <p className="text-muted text-xs">{pct(room.availableMb > 0 ? room.usedMb / room.availableMb : 0)} of {room.availableMb} MB capacity</p>
        </div>
        <div className="card p-4">
          <p className="text-muted text-xs font-medium">Server</p>
          <p className="mt-1 text-2xl font-bold">{room.serverRamMb} MB</p>
          <p className="text-muted text-xs">
            {room.reserveMb} MB reserved
            {room.specs?.cpus ? ` · ${room.specs.cpus} CPUs` : ""}
            {room.specs?.diskMb ? ` · ${room.specs.diskMb} MB disk` : ""}
            {room.freeMb >= 0 ? ` · ${room.freeMb} MB free` : ` · ${Math.abs(room.freeMb)} MB over`}
          </p>
        </div>
      </div>
      <p className="text-muted mt-3 text-xs">
        RAM and containers are the template estimate for a running stack. A paused project counts as 0 MB. This is not live container memory.
      </p>
      {projects.length === 0 ? (
        <div className="card mt-6 px-6 py-10 text-center">
          <p className="text-lg font-semibold">No projects yet</p>
          <p className="text-muted mx-auto mt-1 max-w-md text-sm">
            Create one, or restore an offline file you downloaded earlier.
          </p>
        </div>
      ) : (
        <ul className="mt-6 grid gap-3">
          {projects.map((project) => (
            <li key={project.id} className="card hover:border-blue flex flex-wrap items-center gap-4 px-4 py-4 transition-colors">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-3">
                  <Link href={`/projects/${project.id}`} className="text-lg font-semibold hover:text-blue">
                    {project.name}
                  </Link>
                  <StatusLamp status={project.status} />
                </div>
                <p className="text-muted mt-1 font-mono text-xs break-all">
                  API {project.apiHost}
                  {project.customDomain ? ` · custom ${project.customDomain}` : ""}
                </p>
                <p className="text-muted mt-1 font-mono text-xs break-all">
                  Studio {project.studioHost}
                  {project.panelHost ? ` · panel ${project.panelHost}` : ""}
                </p>
                <p className="mt-2 text-sm">
                  {project.loadMb} MB · {project.containers} containers · {pct(project.capacityShare)} of capacity
                  {room.usedMb > 0 ? ` · ${pct(project.loadShare)} of the load` : ""}
                </p>
                <div className="bg-line mt-2 h-1.5 max-w-xs overflow-hidden rounded-full">
                  <div className="bg-blue h-full rounded-full" style={{ width: `${Math.min(100, Math.round(project.capacityShare * 100))}%` }} />
                </div>
                {project.active ? null : (
                  <p className="text-muted mt-1 text-xs">
                    This one is not counting. Running, it takes {project.ramMb} MB and {TEMPLATE.containers} containers.
                  </p>
                )}
                <p className="text-muted mt-1 text-xs">{formatWhen(project.createdAt)}</p>
                {project.status === "starting" ? (
                  <p className="text-warn mt-1 text-xs">
                    {project.error || "Still booting. The domain can return 404 until the gateway is running."}
                  </p>
                ) : null}
              </div>
              <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
                <a href={`/projects/${project.id}/offline`} className="btn btn-ghost">
                  <Download size={16} />
                  Offline copy
                </a>
                <Link href={`/projects/${project.id}`} className="btn btn-primary">
                  Open
                  <ArrowUpRight size={16} />
                </Link>
                {project.status === "deleting" ? null : (
                  <RemoveProject id={project.id} slug={project.slug} />
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      <LeftoverServices services={leftovers} />
    </div>
  );
}
