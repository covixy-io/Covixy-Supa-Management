"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowUpRight, Copy, Download, LayoutGrid, MoreHorizontal, Plus, Table2, Trash2, X } from "lucide-react";
import { bulkProjectsAction, copyProjectAction, deleteProjectAction } from "@/app/actions";
import { Pager, SearchField, slicePage } from "@/components/data-controls";
import { ImportSupabase } from "@/components/import-supabase";
import { RestoreProject } from "@/components/restore-project";
import { StatusDot } from "@/components/status-lamp";

export type ProjectRow = {
  id: string;
  name: string;
  slug: string;
  status: string;
  scheme: string;
  apiHost: string;
  studioHost: string;
  customDomain: string | null;
  panelHost: string | null;
  loadMb: number;
  containers: number;
  updatedAt: string;
  coolifyServiceUuid: string | null;
  volumeKey: string | null;
};

type ViewMode = "table" | "grid";
type StatusFilter = "all" | "running" | "paused" | "failed";
type SortKey = "updated" | "name" | "memory" | "containers";

function domainOf(project: ProjectRow): string {
  return project.customDomain || project.apiHost;
}

function shortWhen(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return (
    date.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: "UTC",
    }) + " UTC"
  );
}

export function ProjectsScreen({ projects, children }: { projects: ProjectRow[]; children?: React.ReactNode }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [sort, setSort] = useState<SortKey>("updated");
  const [view, setView] = useState<ViewMode>("table");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [selected, setSelected] = useState<string[]>([]);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [menuConfirm, setMenuConfirm] = useState("");
  const [bulkConfirm, setBulkConfirm] = useState("");
  const [copyTarget, setCopyTarget] = useState<ProjectRow | null>(null);

  useEffect(() => {
    const saved = window.localStorage.getItem("projects-view");
    if (saved === "grid" || saved === "table") setView(saved);
  }, []);

  function chooseView(next: ViewMode) {
    setView(next);
    window.localStorage.setItem("projects-view", next);
  }

  const counts = useMemo(
    () => ({
      all: projects.length,
      running: projects.filter((project) => project.status === "running").length,
      paused: projects.filter((project) => project.status === "paused").length,
      failed: projects.filter((project) => project.status === "failed").length,
    }),
    [projects],
  );

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const rows = projects.filter((project) => {
      if (filter !== "all" && project.status !== filter) return false;
      if (!needle) return true;
      const haystack = [
        project.name,
        project.slug,
        project.apiHost,
        project.studioHost,
        project.customDomain,
        project.panelHost,
        project.coolifyServiceUuid,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(needle);
    });
    rows.sort((a, b) => {
      if (sort === "name") return a.name.localeCompare(b.name);
      if (sort === "memory") return b.loadMb - a.loadMb || a.name.localeCompare(b.name);
      if (sort === "containers") return b.containers - a.containers || a.name.localeCompare(b.name);
      return b.updatedAt.localeCompare(a.updatedAt);
    });
    return rows;
  }, [projects, query, filter, sort]);

  const { slice, pages, safePage } = slicePage(filtered, pageSize, page);
  const pageIds = slice.map((project) => project.id);
  const allPageSelected = pageIds.length > 0 && pageIds.every((id) => selected.includes(id));

  function toggle(id: string) {
    setSelected((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  }

  function togglePage() {
    setSelected((current) =>
      allPageSelected ? current.filter((id) => !pageIds.includes(id)) : [...new Set([...current, ...pageIds])],
    );
  }

  function downloadSelected() {
    selected.forEach((id, index) => {
      window.setTimeout(() => {
        const link = document.createElement("a");
        link.href = `/projects/${id}/offline`;
        link.click();
      }, index * 400);
    });
  }

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-2xl">
          <h1 className="text-3xl font-bold tracking-tight">Projects</h1>
          <p className="text-muted mt-2 text-sm leading-6">
            Each project is one Supabase stack. Offline copy keeps keys and settings only. Import from Supabase copies Auth accounts and table data from the hosted project.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="segment" role="group" aria-label="Project layout">
            <button type="button" aria-pressed={view === "table"} onClick={() => chooseView("table")}>
              <Table2 size={14} />
              Table
            </button>
            <button type="button" aria-pressed={view === "grid"} onClick={() => chooseView("grid")}>
              <LayoutGrid size={14} />
              Grid
            </button>
          </div>
          <ImportSupabase />
          <RestoreProject />
          <Link href="/projects/new" className="btn btn-primary">
            <Plus size={16} />
            New project
          </Link>
        </div>
      </div>
      {children}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <SearchField
          value={query}
          onChange={(value) => {
            setQuery(value);
            setPage(1);
          }}
          placeholder="Search name, slug, or domain"
        />
        <div className="segment" role="tablist" aria-label="Status">
          {(
            [
              ["all", "All"],
              ["running", "Running"],
              ["paused", "Paused"],
              ["failed", "Error"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={filter === id}
              onClick={() => {
                setFilter(id);
                setPage(1);
              }}
            >
              {label} ({counts[id]})
            </button>
          ))}
        </div>
        <label className="text-muted flex items-center gap-2 text-sm">
          Sort
          <select
            value={sort}
            onChange={(event) => {
              setSort(event.target.value as SortKey);
              setPage(1);
            }}
            className="rounded-lg border border-[var(--line)] bg-[var(--surface)] px-2 py-2 text-sm text-[var(--ink)]"
          >
            <option value="updated">Last updated</option>
            <option value="name">Name (A–Z)</option>
            <option value="memory">Memory (high to low)</option>
            <option value="containers">Containers</option>
          </select>
        </label>
      </div>

      {filtered.length === 0 ? (
        <div className="card mt-4 px-6 py-10 text-center">
          <p className="text-lg font-semibold">{projects.length === 0 ? "No projects yet" : "No projects match"}</p>
          <p className="text-muted mx-auto mt-1 max-w-md text-sm">
            {projects.length === 0 ? "Create one, or restore an offline file you downloaded earlier." : "Try another status or a shorter search."}
          </p>
        </div>
      ) : view === "table" ? (
        <div className="card mt-4 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-muted text-[13px]">
              <tr className="border-line border-b">
                <th className="w-10 px-3 py-2 font-medium">
                  <input type="checkbox" checked={allPageSelected} onChange={togglePage} aria-label="Select this page" />
                </th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Project</th>
                <th className="px-3 py-2 font-medium">Memory</th>
                <th className="px-3 py-2 font-medium">Domain</th>
                <th className="hidden px-3 py-2 font-medium md:table-cell">Updated</th>
                <th className="px-3 py-2 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {slice.map((project) => (
                <tr key={project.id} className="border-line hover:bg-hover h-12 border-b last:border-0">
                  <td className="px-3">
                    <input
                      type="checkbox"
                      checked={selected.includes(project.id)}
                      onChange={() => toggle(project.id)}
                      aria-label={`Select ${project.name}`}
                    />
                  </td>
                  <td className="px-3 whitespace-nowrap">
                    <StatusDot status={project.status} />
                  </td>
                  <td className="px-3 font-semibold">
                    <Link href={`/projects/${project.id}`} className="hover:text-blue">
                      {project.name}
                    </Link>
                  </td>
                  <td className="text-muted px-3 whitespace-nowrap">
                    {project.loadMb} MB ({project.containers})
                  </td>
                  <td className="px-3">
                    <DomainCell project={project} />
                  </td>
                  <td className="text-muted hidden px-3 whitespace-nowrap md:table-cell">{shortWhen(project.updatedAt)}</td>
                  <td className="px-3 text-right">
                    <RowActions
                      project={project}
                      open={menuId === project.id}
                      confirm={menuConfirm}
                      onConfirm={setMenuConfirm}
                      onToggle={() => {
                        setMenuConfirm("");
                        setMenuId((current) => (current === project.id ? null : project.id));
                      }}
                      onCopy={() => {
                        setMenuId(null);
                        setCopyTarget(project);
                      }}
                    />
                  </td>
                </tr>
              ))}
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
      ) : (
        <div className="mt-4">
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {slice.map((project) => (
              <li key={project.id} className="card hover:bg-hover flex flex-col gap-2 px-3 py-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <Link href={`/projects/${project.id}`} className="font-semibold hover:text-blue">
                      {project.name}
                    </Link>
                    <div className="mt-1">
                      <StatusDot status={project.status} />
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={selected.includes(project.id)}
                    onChange={() => toggle(project.id)}
                    aria-label={`Select ${project.name}`}
                  />
                </div>
                <p className="text-muted text-sm">
                  {project.loadMb} MB ({project.containers} containers)
                </p>
                <DomainCell project={project} />
                <div className="flex items-center justify-between gap-2">
                  <span className="text-muted text-[13px]">{shortWhen(project.updatedAt)}</span>
                  <RowActions
                    project={project}
                    open={menuId === project.id}
                    confirm={menuConfirm}
                    onConfirm={setMenuConfirm}
                    onToggle={() => {
                      setMenuConfirm("");
                      setMenuId((current) => (current === project.id ? null : project.id));
                    }}
                    onCopy={() => {
                      setMenuId(null);
                      setCopyTarget(project);
                    }}
                  />
                </div>
              </li>
            ))}
          </ul>
          <div className="card mt-3">
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
        </div>
      )}

      {selected.length > 0 ? (
        <form action={bulkProjectsAction} className="border-line bg-surface sticky bottom-3 z-30 mt-3 flex flex-wrap items-center gap-2 rounded-xl border px-4 py-3 shadow-lg">
          {selected.map((id) => (
            <input key={id} type="hidden" name="id" value={id} />
          ))}
          <p className="mr-auto text-sm font-medium">{selected.length} selected</p>
          <button type="submit" name="op" value="pause" className="btn btn-ghost btn-sm">
            Pause selected
          </button>
          <button type="submit" name="op" value="start" className="btn btn-ghost btn-sm">
            Start selected
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={downloadSelected}>
            <Download size={14} />
            Download backups
          </button>
          <input
            name="confirm"
            value={bulkConfirm}
            onChange={(event) => setBulkConfirm(event.target.value)}
            placeholder="Type delete"
            aria-label="Type delete to confirm"
            className="w-32 px-2 py-1 text-sm"
          />
          <button type="submit" name="op" value="delete" disabled={bulkConfirm !== "delete"} className="btn btn-danger btn-sm">
            <Trash2 size={14} />
            Delete selected
          </button>
        </form>
      ) : null}
      {copyTarget ? <CopyDialog project={copyTarget} onClose={() => setCopyTarget(null)} /> : null}
    </div>
  );
}

function DomainCell({ project }: { project: ProjectRow }) {
  const host = domainOf(project);
  const detail = `API ${project.customDomain || project.apiHost}\nStudio ${project.panelHost || project.studioHost}`;
  return (
    <span className="group/domain inline-flex max-w-56 items-center gap-1">
      <a href={`${project.scheme === "http" ? "http" : "https"}://${host}`} title={detail} className="truncate font-mono text-[13px] hover:text-blue">
        {host}
      </a>
      <button
        type="button"
        className="icon-btn h-7 w-7 opacity-0 group-hover/domain:opacity-100"
        aria-label={`Copy ${host}`}
        onClick={() => navigator.clipboard.writeText(host)}
      >
        <Copy size={13} />
      </button>
    </span>
  );
}

function copySlug(slug: string): string {
  const base = slug.length > 26 ? slug.slice(0, 26).replace(/-$/, "") : slug;
  return `${base}-copy`;
}

function sharesFiles(project: ProjectRow): boolean {
  return Boolean(project.volumeKey) || Boolean(project.coolifyServiceUuid && !project.coolifyServiceUuid.startsWith("rehearsal-"));
}

function CopyDialog({ project, onClose }: { project: ProjectRow; onClose: () => void }) {
  const sameFiles = sharesFiles(project);
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/40 px-4 py-8" onClick={onClose}>
      <form action={copyProjectAction} className="card w-full max-w-lg p-5" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-lg font-semibold">Copy {project.name}</p>
            <p className="text-muted mt-1 text-sm">
              {sameFiles
                ? "The copy keeps the same database password, Studio password, and API keys, and it opens the same database files. Accounts stay in that database. This is not a downloaded export. The original stack is paused so two databases do not write those files."
                : "The copy keeps the same database password, Studio password, and API keys. Auth users and table rows stay on the original database. This does not download them."}
            </p>
          </div>
          <button type="button" className="icon-btn" aria-label="Close copy" onClick={onClose}>
            <X size={16} />
          </button>
        </div>
        <input type="hidden" name="id" value={project.id} />
        <label className="mt-4 block text-sm font-medium">
          Name
          <input name="name" defaultValue={`${project.name} copy`} className="mt-1.5 w-full px-3 py-2 text-sm" />
        </label>
        <label className="mt-3 block text-sm font-medium">
          Slug
          <input name="slug" defaultValue={copySlug(project.slug)} className="mt-1.5 w-full px-3 py-2 font-mono text-sm" />
        </label>
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary btn-sm">
            <Copy size={14} />
            Copy stack
          </button>
        </div>
      </form>
    </div>
  );
}

function RowActions({
  project,
  open,
  confirm,
  onConfirm,
  onToggle,
  onCopy,
}: {
  project: ProjectRow;
  open: boolean;
  confirm: string;
  onConfirm: (value: string) => void;
  onToggle: () => void;
  onCopy: () => void;
}) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const onToggleRef = useRef(onToggle);
  onToggleRef.current = onToggle;
  const [box, setBox] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    if (!open) return;
    function place() {
      const rect = buttonRef.current?.getBoundingClientRect();
      if (!rect) return;
      const width = 280;
      const height = 248;
      const left = Math.max(8, Math.min(rect.right - width, window.innerWidth - width - 8));
      const below = rect.bottom + 6;
      const top = below + height > window.innerHeight ? Math.max(8, rect.top - height - 6) : below;
      setBox((current) => (current && current.top === top && current.left === left ? current : { top, left }));
    }
    place();
    function closeOnOutside(event: MouseEvent) {
      const target = event.target as Node | null;
      if (buttonRef.current?.contains(target)) return;
      if (target instanceof Element && target.closest("[data-row-menu]")) return;
      onToggleRef.current();
    }
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    window.addEventListener("mousedown", closeOnOutside);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
      window.removeEventListener("mousedown", closeOnOutside);
    };
  }, [open]);

  const menu =
    open && box
      ? createPortal(
          <div
            data-row-menu
            className="border-line bg-surface w-[280px] rounded-lg border p-2 text-left shadow-lg"
            style={{ position: "fixed", top: box.top, left: box.left, zIndex: 40 }}
          >
            <button type="button" className="hover:bg-hover flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm" onClick={onCopy}>
              <Copy size={14} />
              Copy stack
            </button>
            <a href={`/projects/${project.id}/offline`} title="Keys and settings only. Auth users and table rows are not in this file." className="hover:bg-hover flex items-center gap-2 rounded-md px-2 py-2 text-sm">
              <Download size={14} />
              Offline copy
            </a>
            {project.status === "deleting" ? null : (
              <form action={deleteProjectAction} className="mt-1 space-y-2 px-2 py-2">
                <input type="hidden" name="id" value={project.id} />
                <input type="hidden" name="slug" value={project.slug} />
                <p className="text-muted text-[13px]">Type {project.slug} to remove this stack and its database.</p>
                <input
                  name="confirm"
                  value={confirm}
                  onChange={(event) => onConfirm(event.target.value)}
                  className="w-full px-2 py-1 font-mono text-sm"
                  autoComplete="off"
                />
                <button type="submit" disabled={confirm !== project.slug} className="btn btn-danger btn-sm">
                  <Trash2 size={14} />
                  Remove
                </button>
              </form>
            )}
          </div>,
          document.body,
        )
      : null;

  return (
    <span className="inline-flex items-center gap-1">
      <Link href={`/projects/${project.id}`} className="btn btn-primary btn-sm">
        Open
        <ArrowUpRight size={14} />
      </Link>
      <button
        ref={buttonRef}
        type="button"
        className="icon-btn"
        aria-label={`More actions for ${project.name}`}
        aria-expanded={open}
        onClick={onToggle}
      >
        <MoreHorizontal size={16} />
      </button>
      {menu}
    </span>
  );
}
