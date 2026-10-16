import { ActivityTables } from "@/components/activity-tables";
import { PageHeader } from "@/components/page-header";
import { listAudit, listJobs } from "@/lib/projects";

export default function ActivityPage() {
  const jobs = listJobs(200);
  const audit = listAudit(200);

  return (
    <div>
      <PageHeader title="Activity" lede="Jobs move a stack. The audit records who revealed a secret or exported a project." />
      <ActivityTables
        jobs={jobs.map((job) => ({
          id: job.id,
          createdAt: job.createdAt,
          projectSlug: job.projectSlug,
          type: job.type,
          status: job.status,
          error: job.error,
        }))}
        audit={audit.map((entry) => ({
          id: entry.id,
          at: entry.at,
          action: entry.action,
          projectSlug: entry.projectSlug,
          detail: entry.detail,
        }))}
      />
    </div>
  );
}
