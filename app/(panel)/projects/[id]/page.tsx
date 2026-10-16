import Link from "next/link";
import { Download, FileCode } from "lucide-react";
import { notFound } from "next/navigation";
import { AddressEditor } from "@/components/address-editor";
import { EnvEditor } from "@/components/env-editor";
import { LiveRefresh } from "@/components/live-refresh";
import { PageHeader } from "@/components/page-header";
import { ProjectActions } from "@/components/project-actions";
import { isBusy, StatusLamp } from "@/components/status-lamp";
import { projectAnalytics } from "@/lib/analytics";
import { coolifyMode } from "@/lib/coolify";
import { getProject, latestJob, listEnvPublic } from "@/lib/projects";
import { panelApex } from "@/lib/settings";
import { describeAddresses } from "@/lib/urls";

function pct(value: number): string {
  return `${Math.round(value * 100)}%`;
}

export default async function ProjectPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const project = getProject(id);
  if (!project) notFound();
  const job = latestJob(project.id);
  const env = listEnvPublic(project.id);
  const analytics = projectAnalytics().projects.find((item) => item.id === project.id);
  const addresses = describeAddresses({
    apiHost: project.apiHost,
    studioHost: project.studioHost,
    scheme: project.scheme,
    customDomain: project.customDomain,
    panelHost: project.panelHost,
  });
  const apiUrl = addresses.canonicalApiUrl;
  const studioUrl = addresses.canonicalPanelUrl;

  return (
    <div>
      <LiveRefresh active={isBusy(project.status)} />
      <Link href="/projects" className="text-muted text-sm font-medium hover:text-blue">
        Projects
      </Link>
      <div className="mt-3">
        <PageHeader title={project.name} lede={`${apiUrl} · Studio at ${studioUrl}`}>
          <StatusLamp status={project.status} />
          <a href={`/projects/${project.id}/offline`} className="btn btn-primary">
            <Download size={16} />
            Download offline
          </a>
          <a href={`/projects/${project.id}/compose`} className="btn btn-ghost">
            <FileCode size={16} />
            Compose
          </a>
        </PageHeader>
        <p className="text-muted mt-3 max-w-2xl text-sm">
          The offline file keeps the name, slug, and every environment value, including keys. Restore it from Projects.
          It does not include database rows.
        </p>
      </div>
      {project.status === "starting" ? (
        <p className="bg-warn-soft text-warn mt-4 max-w-2xl rounded-xl px-4 py-3 text-sm">
          Starting. The domain can return 404 until gateway is running.
          {project.error ? ` ${project.error}` : " The database can be healthy while the other containers are still starting."}
        </p>
      ) : null}
      {project.status !== "starting" && project.error ? (
        <p className="text-danger mt-4 max-w-2xl text-sm">{project.error}</p>
      ) : null}
      {query.error ? <p className="text-danger mt-4 max-w-2xl text-sm">{query.error}</p> : null}

      <section className="mt-8 grid gap-6 lg:grid-cols-[1.3fr_0.7fr]">
        <div className="space-y-6">
          <AddressEditor
            projectId={project.id}
            slug={project.slug}
            apex={panelApex()}
            scheme={project.scheme}
            customDomain={project.customDomain || ""}
            panelHost={addresses.effectivePanelHost}
            apiHost={project.apiHost}
            studioHost={project.studioHost}
          />
          <p className="text-muted text-sm">
            Studio user is supabase. Keys and passwords stay hidden until you reveal them. Email confirmation is off
            until SMTP is set.
          </p>
          <EnvEditor projectId={project.id} rows={env} />
        </div>

        <aside className="space-y-4">
          {analytics ? (
            <div className="card p-4 text-sm">
              <p className="text-muted text-xs font-medium">Load</p>
              <p className="mt-1 text-2xl font-bold">{analytics.loadMb} MB</p>
              <dl className="mt-3 space-y-2">
                <div className="flex justify-between gap-4">
                  <dt className="text-muted">Share of capacity</dt>
                  <dd>{pct(analytics.capacityShare)}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-muted">Share of load</dt>
                  <dd>{pct(analytics.loadShare)}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-muted">Containers</dt>
                  <dd>{analytics.containers}</dd>
                </div>
              </dl>
              <p className="text-muted mt-3 text-xs">Estimated from the template, not live container memory.</p>
            </div>
          ) : null}

          <div className="card p-4 text-sm">
            <p className="text-muted text-xs font-medium">Stack</p>
            <dl className="mt-3 space-y-2">
              <div className="flex justify-between gap-4">
                <dt className="text-muted">Template</dt>
                <dd>
                  {project.templateId} {project.templateVersion}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted">Postgres</dt>
                <dd>{project.postgresMajor}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted">Mode</dt>
                <dd>{coolifyMode()}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted">Coolify</dt>
                <dd className="font-mono text-xs">{project.coolifyServiceUuid || "—"}</dd>
              </div>
            </dl>
          </div>

          {job ? (
            <div className="card p-4">
              <p className="text-muted text-xs font-medium">
                Latest job · {job.type} · {job.status}
              </p>
              <pre className="bg-bg mt-3 max-h-64 overflow-auto rounded-lg p-3 font-mono text-xs whitespace-pre-wrap">
                {job.log || "Waiting for the worker."}
              </pre>
            </div>
          ) : null}

          <ProjectActions
            id={project.id}
            slug={project.slug}
            status={project.status}
            lastJob={job?.type ?? null}
            keysLocal={project.keysLocal}
          />
        </aside>
      </section>
    </div>
  );
}
