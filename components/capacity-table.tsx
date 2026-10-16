"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Pager, SearchField, slicePage } from "@/components/data-controls";
import { StatusDot } from "@/components/status-lamp";

type Row = {
  id: string;
  name: string;
  status: string;
  loadMb: number;
  capacityShare: number;
  loadShare: number;
  containers: number;
};

function pct(value: number): string {
  return `${Math.round(value * 100)}%`;
}

export function CapacityTable({ projects }: { projects: Row[] }) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<"name" | "memory" | "containers">("memory");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const rows = projects.filter((project) => !needle || project.name.toLowerCase().includes(needle) || project.status.includes(needle));
    rows.sort((a, b) => {
      if (sort === "name") return a.name.localeCompare(b.name);
      if (sort === "containers") return b.containers - a.containers || a.name.localeCompare(b.name);
      return b.loadMb - a.loadMb || a.name.localeCompare(b.name);
    });
    return rows;
  }, [projects, query, sort]);
  const { slice, pages, safePage } = slicePage(filtered, pageSize, page);

  return (
    <div className="card mt-4 overflow-x-auto">
      <div className="flex flex-wrap items-center gap-2 px-3 pt-3">
        <SearchField
          value={query}
          onChange={(value) => {
            setQuery(value);
            setPage(1);
          }}
          placeholder="Search projects"
        />
        <select
          value={sort}
          aria-label="Sort projects"
          onChange={(event) => setSort(event.target.value as typeof sort)}
          className="rounded-lg border border-[var(--line)] bg-[var(--surface)] px-2 py-2 text-sm"
        >
          <option value="memory">Memory (high to low)</option>
          <option value="name">Name (A–Z)</option>
          <option value="containers">Containers</option>
        </select>
      </div>
      <table className="mt-2 w-full text-left text-sm">
        <thead className="text-muted text-[13px]">
          <tr className="border-line border-b">
            <th className="px-3 py-2 font-medium">Project</th>
            <th className="px-3 py-2 font-medium">Status</th>
            <th className="px-3 py-2 font-medium">RAM</th>
            <th className="hidden px-3 py-2 font-medium md:table-cell">Of capacity</th>
            <th className="hidden px-3 py-2 font-medium md:table-cell">Of load</th>
            <th className="px-3 py-2 font-medium">Containers</th>
          </tr>
        </thead>
        <tbody>
          {slice.length === 0 ? (
            <tr>
              <td colSpan={6} className="text-muted px-3 py-6">
                {projects.length === 0 ? "No projects yet." : "No projects match."}
              </td>
            </tr>
          ) : (
            slice.map((project) => (
              <tr key={project.id} className="border-line hover:bg-hover h-12 border-b last:border-0">
                <td className="px-3">
                  <Link href={`/projects/${project.id}`} className="font-semibold hover:text-blue">
                    {project.name}
                  </Link>
                </td>
                <td className="px-3">
                  <StatusDot status={project.status} />
                </td>
                <td className="px-3">{project.loadMb} MB</td>
                <td className="hidden px-3 md:table-cell">{pct(project.capacityShare)}</td>
                <td className="hidden px-3 md:table-cell">{pct(project.loadShare)}</td>
                <td className="px-3">{project.containers}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
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
  );
}
