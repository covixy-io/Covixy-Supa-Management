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
    <div className="card">
      <div className="flex flex-wrap items-center justify-between gap-3 p-5 pb-3">
        <div>
          <h2 className="text-sm font-semibold">Environment</h2>
          <p className="text-muted text-sm">{rows.length} variables. Sealed values stay hidden until you reveal them.</p>
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
      {error ? <p className="text-danger px-5 text-sm">{error}</p> : null}
      <div className="env-scroll mx-3 mb-3">
        <table className="w-full text-left text-sm">
          <thead className="text-muted text-[13px]">
            <tr className="border-line border-b">
              <th className="py-2 pr-4 pl-2 font-medium">Key</th>
              <th className="py-2 font-medium">Value</th>
              <th className="w-28 py-2 pr-1 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => {
              const shown = row.secret ? revealed[row.key] : row.value;
              const isEditing = editing === row.key;
              return (
                <tr key={row.key} className="group border-line hover:bg-hover border-b last:border-0">
                  <th scope="row" className="py-2.5 pr-4 pl-2 align-top font-mono text-[13px] font-medium">
                    {row.key}
                  </th>
                  <td className="text-muted py-2.5 align-top font-mono text-[13px] break-all">
                    {isEditing ? (
                      <input
                        value={draft}
                        onChange={(event) => setDraft(event.target.value)}
                        className="w-full px-2 py-1.5 font-mono text-[13px]"
                      />
                    ) : shown === undefined || shown === null ? (
                      "••••••••"
                    ) : (
                      shown || "Empty"
                    )}
                  </td>
                  <td className="w-28 py-1.5 pr-1 text-right align-top">
                    <div
                      className={`inline-flex justify-end gap-0.5 ${
                        isEditing ? "" : "sm:opacity-0 sm:group-focus-within:opacity-100 sm:group-hover:opacity-100"
                      }`}
                    >
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
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {visible.length === 0 ? <p className="text-muted px-2 py-6 text-sm">No variables match that search.</p> : null}
      </div>
    </div>
  );
}
