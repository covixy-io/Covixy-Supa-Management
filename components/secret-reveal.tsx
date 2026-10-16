"use client";

import { useState } from "react";
import { revealSecretAction } from "@/app/actions";
import type { SecretKind } from "@/lib/projects";
import { CopyButton } from "@/components/copy-button";

export function SecretReveal({
  projectId,
  kind,
  label,
  note,
}: {
  projectId: string;
  kind: SecretKind;
  label: string;
  note: string;
}) {
  const [value, setValue] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  return (
    <div className="border-line border-t py-4">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <p className="text-sm">{label}</p>
          <p className="text-muted text-sm">{note}</p>
        </div>
        {value ? (
          <CopyButton value={value} />
        ) : (
          <button
            type="button"
            disabled={pending}
            className="btn btn-ghost"
            onClick={async () => {
              setPending(true);
              setError(null);
              const result = await revealSecretAction(projectId, kind);
              setPending(false);
              if (result.error || !result.value) setError(result.error || "Could not reveal this secret.");
              else setValue(result.value);
            }}
          >
            {pending ? "Reading…" : "Reveal"}
          </button>
        )}
      </div>
      {value ? <p className="mt-3 font-mono text-xs break-all">{value}</p> : null}
      {error ? <p className="text-danger mt-2 text-sm">{error}</p> : null}
    </div>
  );
}
