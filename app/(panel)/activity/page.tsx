import { PageHeader } from "@/components/page-header";
import { formatWhen } from "@/lib/format";
import { listAudit, listJobs } from "@/lib/projects";

export default function ActivityPage() {
  const jobs = listJobs();
  const audit = listAudit();

  return (
    <div>
      <PageHeader title="Activity" lede="Jobs move a stack. The audit records who revealed a secret or exported a project." />
      <h2 className="mt-8 text-sm font-semibold">Jobs</h2>
      {jobs.length === 0 ? (
        <p className="text-muted mt-3 text-sm">No jobs yet.</p>
      ) : (
        <ul className="card mt-3 divide-y divide-line">
          {jobs.map((job) => (
            <li key={job.id} className="grid gap-1 px-4 py-3 text-sm md:grid-cols-[11rem_8rem_1fr]">
              <span className="text-muted">{formatWhen(job.createdAt)}</span>
              <span className="font-medium">
                {job.projectSlug} · {job.type}
              </span>
              <span className={job.status === "failed" ? "text-danger" : ""}>
                {job.status}
                {job.error ? ` — ${job.error}` : ""}
              </span>
            </li>
          ))}
        </ul>
      )}
      <h2 className="mt-8 text-sm font-semibold">Audit</h2>
      {audit.length === 0 ? (
        <p className="text-muted mt-3 text-sm">No audit rows yet.</p>
      ) : (
        <ul className="card mt-3 divide-y divide-line">
          {audit.map((entry) => (
            <li key={entry.id} className="grid gap-1 px-4 py-3 text-sm md:grid-cols-[11rem_10rem_1fr]">
              <span className="text-muted">{formatWhen(entry.at)}</span>
              <span className="font-medium">{entry.action}</span>
              <span>
                {entry.projectSlug} — {entry.detail}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
