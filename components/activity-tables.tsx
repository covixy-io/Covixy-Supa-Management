"use client";

import { useMemo, useState } from "react";
import { Pager, SearchField, slicePage } from "@/components/data-controls";
import { formatWhen } from "@/lib/format";

type JobRow = {
  id: string;
  createdAt: string;
  projectSlug: string;
  type: string;
  status: string;
  error: string | null;
};

type AuditRow = {
  id: string;
  at: string;
  action: string;
  projectSlug: string;
  detail: string;
};

export function ActivityTables({ jobs, audit }: { jobs: JobRow[]; audit: AuditRow[] }) {
  return (
    <div className="mt-8 space-y-8">
      <RecordTable
        title="Jobs"
        empty="No jobs yet."
        search="Search jobs"
        rows={jobs.map((job) => ({
          id: job.id,
          when: job.createdAt,
          label: `${job.projectSlug} · ${job.type}`,
          detail: `${job.status}${job.error ? ` — ${job.error}` : ""}`,
          danger: job.status === "failed",
        }))}
      />
      <RecordTable
        title="Audit"
        empty="No audit rows yet."
        search="Search audit"
        rows={audit.map((entry) => ({
          id: entry.id,
          when: entry.at,
          label: entry.action,
          detail: `${entry.projectSlug} — ${entry.detail}`,
          danger: false,
        }))}
      />
    </div>
  );
}

function RecordTable({
  title,
  empty,
  search,
  rows,
}: {
  title: string;
  empty: string;
  search: string;
  rows: { id: string; when: string; label: string; detail: string; danger: boolean }[];
}) {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((row) => `${row.label} ${row.detail}`.toLowerCase().includes(needle));
  }, [rows, query]);
  const { slice, pages, safePage } = slicePage(filtered, pageSize, page);

  return (
    <section>
      <h2 className="text-sm font-semibold">{title}</h2>
      <div className="card mt-3 overflow-x-auto">
        <div className="px-3 pt-3">
          <SearchField
            value={query}
            onChange={(value) => {
              setQuery(value);
              setPage(1);
            }}
            placeholder={search}
          />
        </div>
        {filtered.length === 0 ? (
          <p className="text-muted px-3 py-6 text-sm">{rows.length === 0 ? empty : "No rows match."}</p>
        ) : (
          <table className="mt-2 w-full text-left text-sm">
            <thead className="text-muted text-[13px]">
              <tr className="border-line border-b">
                <th className="px-3 py-2 font-medium">When</th>
                <th className="px-3 py-2 font-medium">{title === "Jobs" ? "Project" : "Action"}</th>
                <th className="px-3 py-2 font-medium">Detail</th>
              </tr>
            </thead>
            <tbody>
              {slice.map((row) => (
                <tr key={row.id} className="border-line hover:bg-hover h-12 border-b last:border-0">
                  <td className="text-muted px-3 whitespace-nowrap">{formatWhen(row.when)}</td>
                  <td className="px-3 font-medium whitespace-nowrap">{row.label}</td>
                  <td className={`px-3 ${row.danger ? "text-danger" : ""}`}>{row.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <Pager
          page={safePage}
          pages={pages}
          pageSize={pageSize}
          total={filtered.length}
          onPage={setPage}
          onPageSize={(size) => {
            setPageSize(size);
            setPage(1);
          }}
        />
      </div>
    </section>
  );
}
