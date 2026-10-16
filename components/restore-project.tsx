"use client";

import { useState } from "react";
import { ArchiveRestore, X } from "lucide-react";
import { restoreProjectAction } from "@/app/actions";
import { parseArchive } from "@/lib/archive";

export function RestoreProject() {
  const [open, setOpen] = useState(false);
  const [raw, setRaw] = useState("");
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [exportedAt, setExportedAt] = useState("");
  const [counts, setCounts] = useState<{ secret: number; plain: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  function reset() {
    setOpen(false);
    setRaw("");
    setName("");
    setSlug("");
    setExportedAt("");
    setCounts(null);
    setError(null);
  }

  return (
    <div>
      <button type="button" className="btn btn-ghost" onClick={() => setOpen(true)}>
        <ArchiveRestore size={16} />
        Restore
      </button>
      {open ? (
        <div className="fixed inset-0 z-30 grid place-items-center bg-ink/40 px-4 py-8" onClick={reset}>
        <div className="card w-full max-w-lg p-5" onClick={(event) => event.stopPropagation()}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-lg font-semibold">Restore an offline project</p>
              <p className="text-muted mt-1 text-sm">
                Choose a Covixy offline file. It restores the same keys and settings. Auth users, table rows, and storage files are not in that file.
              </p>
            </div>
            <button type="button" className="icon-btn" aria-label="Close restore" onClick={reset}>
              <X size={16} />
            </button>
          </div>
          <label className="mt-4 block text-sm font-medium">
            Offline file
            <input
              type="file"
              accept="application/json,.json"
              className="mt-1.5 w-full px-3 py-2 text-sm"
              onChange={async (event) => {
                setError(null);
                const file = event.target.files?.[0];
                if (!file) return;
                const text = await file.text();
                try {
                  const archive = parseArchive(JSON.parse(text) as unknown);
                  const values = Object.values(archive.env);
                  setRaw(text);
                  setName(archive.name);
                  setSlug(archive.slug);
                  setExportedAt(archive.exportedAt);
                  setCounts({
                    secret: values.filter((item) => item.secret).length,
                    plain: values.filter((item) => !item.secret).length,
                  });
                } catch (reason) {
                  setRaw("");
                  setCounts(null);
                  setError(reason instanceof Error ? reason.message : "Could not read that file.");
                }
              }}
            />
          </label>
          {counts ? (
            <div className="bg-bg mt-4 rounded-xl p-3 text-sm">
              <p className="font-semibold">{name}</p>
              <p className="text-muted mt-1">{counts.secret} sealed values, {counts.plain} visible values. Keys stay in the file until you restore.</p>
              <label className="mt-3 block">
                <span className="text-muted text-xs font-medium">Slug</span>
                <input
                  value={slug}
                  onChange={(event) => setSlug(event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 32))}
                  className="mt-1 w-full px-3 py-2 font-mono text-sm"
                />
              </label>
              {exportedAt ? <p className="text-muted mt-2 text-xs">Exported {exportedAt.replace("T", " ").slice(0, 16)} UTC</p> : null}
            </div>
          ) : null}
          {error ? <p className="text-danger mt-3 text-sm">{error}</p> : null}
          <div className="mt-4 flex justify-end gap-2">
            <button type="button" className="btn btn-ghost" onClick={reset}>
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={!raw || !slug || pending}
              onClick={async () => {
                setPending(true);
                setError(null);
                const result = await restoreProjectAction(raw, slug);
                setPending(false);
                if (result?.error) setError(result.error);
              }}
            >
              <ArchiveRestore size={16} />
              {pending ? "Restoring…" : "Restore project"}
            </button>
          </div>
        </div>
        </div>
      ) : null}
    </div>
  );
}
