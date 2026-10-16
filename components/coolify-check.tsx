"use client";

import { useState } from "react";
import { checkCoolifyAction } from "@/app/actions";

export function CoolifyCheck() {
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  return (
    <div className="mt-4">
      <button
        type="button"
        disabled={pending}
        className="btn btn-ghost"
        onClick={async () => {
          setPending(true);
          const next = await checkCoolifyAction();
          setPending(false);
          setResult(
            next.ok
              ? next.servers.length
                ? next.servers.map((server) => `${server.name} ${server.uuid}`).join(", ")
                : "Connected. No servers returned."
              : next.error,
          );
        }}
      >
        {pending ? "Checking…" : "Check Coolify"}
      </button>
      {result ? <p className="text-muted mt-3 font-mono text-xs">{result}</p> : null}
    </div>
  );
}
