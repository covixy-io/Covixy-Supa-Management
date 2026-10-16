"use client";

import { ChevronLeft, ChevronRight, Search } from "lucide-react";

export function slicePage<T>(rows: T[], pageSize: number, page: number): { slice: T[]; pages: number; safePage: number } {
  const pages = Math.max(1, Math.ceil(rows.length / pageSize));
  const safePage = Math.min(page, pages);
  const start = (safePage - 1) * pageSize;
  return { slice: rows.slice(start, start + pageSize), pages, safePage };
}

export function SearchField({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <label className="relative min-w-48 flex-1">
      <Search size={14} className="text-muted absolute top-2.5 left-3" />
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="w-full py-2 pr-3 pl-8 text-sm"
      />
    </label>
  );
}

export function Pager({
  page,
  pages,
  pageSize,
  total,
  onPage,
  onPageSize,
}: {
  page: number;
  pages: number;
  pageSize: number;
  total: number;
  onPage: (page: number) => void;
  onPageSize: (size: number) => void;
}) {
  return (
    <div className="text-muted flex flex-wrap items-center justify-between gap-3 px-3 py-2 text-sm">
      <p>
        {total} {total === 1 ? "row" : "rows"} · page {page} of {pages}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2">
          Items per page
          <select
            value={pageSize}
            onChange={(event) => onPageSize(Number(event.target.value))}
            className="rounded-lg border border-[var(--line)] bg-[var(--surface)] px-2 py-1 text-sm"
          >
            {[25, 50, 100].map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </label>
        <button type="button" className="btn btn-ghost btn-sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          <ChevronLeft size={14} />
          Prev
        </button>
        <button type="button" className="btn btn-ghost btn-sm" disabled={page >= pages} onClick={() => onPage(page + 1)}>
          Next
          <ChevronRight size={14} />
        </button>
      </div>
    </div>
  );
}
