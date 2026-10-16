import Link from "next/link";
import { ArrowUpRight, Download, Plus } from "lucide-react";
import { LiveRefresh } from "@/components/live-refresh";
import { PageHeader } from "@/components/page-header";
import { RestoreProject } from "@/components/restore-project";
import { isBusy, StatusLamp } from "@/components/status-lamp";
import { coolifyMode } from "@/lib/coolify";
import { formatWhen } from "@/lib/format";
import { listProjects } from "@/lib/projects";
import { describeAddresses } from "@/lib/urls";

export default function ProjectsPage() {
  const projects = listProjects();
  const mode = coolifyMode();

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
      {mode === "rehearsal" ? (
        <p className="bg-warn-soft text-warn mt-5 rounded-xl px-4 py-3 text-sm">
          Rehearsal mode. Projects are saved here, and Coolify calls wait until the API URL, token, project, and server are set.
        </p>
      ) : null}
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
                <p className="text-muted mt-1 truncate font-mono text-xs">
                  {describeAddresses({
                    apiHost: project.apiHost,
                    studioHost: project.studioHost,
                    scheme: project.scheme,
                    customDomain: project.customDomain,
                    panelHost: project.panelHost,
                  }).canonicalApiUrl}
                </p>
                <p className="text-muted mt-1 text-xs">{formatWhen(project.createdAt)}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <a href={`/projects/${project.id}/offline`} className="btn btn-ghost">
                  <Download size={16} />
                  Offline copy
                </a>
                <Link href={`/projects/${project.id}`} className="btn btn-primary">
                  Open
                  <ArrowUpRight size={16} />
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
