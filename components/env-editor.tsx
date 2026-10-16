"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, Eye, EyeOff, Pencil, Search } from "lucide-react";
import { readEnvValueAction, updateEnvAction } from "@/app/actions";
import type { PublicEnv } from "@/lib/projects";

export function EnvEditor({ projectId, rows }: { projectId: string; rows: PublicEnv[] }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [revealed, setRevealed] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [copied, setCopied] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((row) => row.key.toLowerCase().includes(needle));
  }, [query, rows]);

  async function valueFor(row: PublicEnv): Promise<string | null> {
    if (!row.secret) return row.value;
    if (revealed[row.key] !== undefined) return revealed[row.key];
    const result = await readEnvValueAction(projectId, row.key);
    if (result.error || result.value === undefined) {
      setError(result.error || "Could not read that variable.");
      return null;
    }
    setRevealed((current) => ({ ...current, [row.key]: result.value as string }));
    return result.value;
  }

  return (
    <div className="card p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">Environment</h2>
          <p className="text-muted text-xs">{rows.length} variables. Sealed values stay hidden until you reveal them.</p>
        </div>
        <label className="relative">
          <Search size={14} className="text-muted absolute top-2.5 left-3" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search variables"
            className="py-2 pr-3 pl-8 text-sm"
            aria-label="Search variables"
          />
        </label>
      </div>
      {error ? <p className="text-danger mt-3 text-sm">{error}</p> : null}
      <ul className="mt-3 max-h-[28rem] divide-y divide-line overflow-auto">
        {visible.map((row) => {
          const shown = row.secret ? revealed[row.key] : row.value;
          const isEditing = editing === row.key;
          return (
            <li key={row.key} className="flex flex-wrap items-center gap-2 py-3">
              <div className="min-w-40 flex-1">
                <p className="font-mono text-xs font-medium">{row.key}</p>
                {isEditing ? (
                  <input
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    className="mt-2 w-full px-2 py-1.5 font-mono text-xs"
                  />
                ) : (
                  <p className="text-muted mt-1 font-mono text-xs break-all">
                    {shown === undefined || shown === null ? "••••••••" : shown || "Empty"}
                  </p>
                )}
              </div>
              <div className="flex gap-1">
                {row.secret ? (
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label={shown ? `Hide ${row.key}` : `Reveal ${row.key}`}
                    onClick={async () => {
                      setError(null);
                      if (shown) {
                        setRevealed((current) => {
                          const next = { ...current };
                          delete next[row.key];
                          return next;
                        });
                        return;
                      }
                      await valueFor(row);
                    }}
                  >
                    {shown ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                ) : null}
                <button
                  type="button"
                  className="icon-btn"
                  aria-label={`Copy ${row.key}`}
                  onClick={async () => {
                    setError(null);
                    const value = await valueFor(row);
                    if (value === null) return;
                    await navigator.clipboard.writeText(value);
                    setCopied(row.key);
                    window.setTimeout(() => setCopied((current) => (current === row.key ? null : current)), 1200);
                  }}
                >
                  {copied === row.key ? <Check size={15} /> : <Copy size={15} />}
                </button>
                {isEditing ? (
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label={`Save ${row.key}`}
                    disabled={pending}
                    onClick={async () => {
                      setPending(true);
                      setError(null);
                      const result = await updateEnvAction(projectId, row.key, draft);
                      setPending(false);
                      if (result.error) {
                        setError(result.error);
                        return;
                      }
                      setEditing(null);
                      if (row.secret) setRevealed((current) => ({ ...current, [row.key]: draft }));
                      router.refresh();
                    }}
                  >
                    <Check size={15} />
                  </button>
                ) : (
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label={`Edit ${row.key}`}
                    onClick={async () => {
                      setError(null);
                      const value = await valueFor(row);
                      if (value === null) return;
                      setDraft(value);
                      setEditing(row.key);
                    }}
                  >
                    <Pencil size={15} />
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {visible.length === 0 ? <p className="text-muted py-6 text-sm">No variables match that search.</p> : null}
    </div>
  );
}
