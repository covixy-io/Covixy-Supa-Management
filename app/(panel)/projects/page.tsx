import { LeftoverServices } from "@/components/leftover-services";
import { LiveRefresh } from "@/components/live-refresh";
import { ProjectsScreen, type ProjectRow } from "@/components/projects-screen";
import { isBusy } from "@/components/status-lamp";
import { projectAnalytics } from "@/lib/analytics";
import { coolifyMode, leftoverServices, listServices, type LeftoverService } from "@/lib/coolify";
import { TEMPLATE } from "@/lib/template";

function pct(value: number): string {
  return `${Math.round(value * 100)}%`;
}

export default async function ProjectsPage({ searchParams }: { searchParams: Promise<{ error?: string; notice?: string }> }) {
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
  const rows: ProjectRow[] = projects.map((project) => ({
    id: project.id,
    name: project.name,
    slug: project.slug,
    status: project.status,
    scheme: project.scheme,
    apiHost: project.apiHost,
    studioHost: project.studioHost,
    customDomain: project.customDomain,
    panelHost: project.panelHost,
    loadMb: project.loadMb,
    containers: project.containers,
    updatedAt: project.updatedAt,
    coolifyServiceUuid: project.coolifyServiceUuid,
    volumeKey: project.volumeKey,
  }));

  return (
    <div className="pb-16">
      <LiveRefresh active={projects.some((project) => isBusy(project.status))} />
      <ProjectsScreen projects={rows}>
      {query.error ? <p className="bg-warn-soft text-warn mt-4 rounded-lg px-4 py-3 text-sm">{query.error}</p> : null}
      {query.notice ? <p className="text-muted mt-4 text-sm">{query.notice}</p> : null}
      {mode === "rehearsal" ? (
        <p className="bg-warn-soft text-warn mt-4 rounded-lg px-4 py-3 text-sm">
          Rehearsal mode. Projects are saved here, and Coolify calls wait until the API URL, token, project, and server are set.
        </p>
      ) : null}
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="card p-4">
          <p className="text-muted text-sm font-medium">Projects</p>
          <p className="mt-1 text-2xl font-bold">{projects.length}</p>
          <p className="text-muted text-sm">{room.activeStacks} counting toward load</p>
        </div>
        <div className="card p-4">
          <p className="text-muted text-sm font-medium">Each stack</p>
          <p className="mt-1 text-2xl font-bold">{room.stackRamMb} MB</p>
          <p className="text-muted text-sm">{TEMPLATE.containers} containers while it is running</p>
        </div>
        <div className="card p-4">
          <p className="text-muted text-sm font-medium">Load</p>
          <p className="mt-1 text-2xl font-bold">{room.usedMb} MB</p>
          <p className="text-muted text-sm">
            {pct(room.availableMb > 0 ? room.usedMb / room.availableMb : 0)} of {room.availableMb} MB capacity
          </p>
        </div>
        <div className="card p-4">
          <p className="text-muted text-sm font-medium">Server</p>
          <p className="mt-1 text-2xl font-bold">{room.serverRamMb} MB</p>
          <p className="text-muted text-sm">
            {room.reserveMb} MB reserved
            {room.specs?.cpus ? ` · ${room.specs.cpus} CPUs` : ""}
            {room.freeMb >= 0 ? ` · ${room.freeMb} MB free` : ` · ${Math.abs(room.freeMb)} MB over`}
          </p>
        </div>
      </div>
      <p className="text-muted mt-3 text-sm">
        RAM and containers are the template estimate for a running stack. A paused project counts as 0 MB. This is not live container memory.
      </p>
      </ProjectsScreen>
      <LeftoverServices services={leftovers} />
    </div>
  );
}
