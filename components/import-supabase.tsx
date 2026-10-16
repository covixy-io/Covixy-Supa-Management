"use client";

import { useState } from "react";
import { CloudDownload, X } from "lucide-react";
import { importSupabaseAction } from "@/app/actions";

export function ImportSupabase() {
  const [open, setOpen] = useState(false);
  return (
    <>
    <button type="button" className="btn btn-ghost" onClick={() => setOpen(true)}>
      <CloudDownload size={16} />
      Import from Supabase
    </button>
    {open ? (
    <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-ink/40 px-4 py-8" onClick={() => setOpen(false)}>
      <form action={importSupabaseAction} className="card my-auto w-full max-w-lg p-5" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-lg font-semibold">Import from Supabase</p>
            <p className="text-muted mt-1 text-sm">
              This copies the hosted project: Auth accounts and passwords, table rows, policies, and storage files. People sign in with the same password. Paste the session or direct connection string on port 5432, plus the JWT secret, anon key, and service role key from the API settings. Edge functions are not copied.
            </p>
          </div>
          <button type="button" className="icon-btn" aria-label="Close import" onClick={() => setOpen(false)}>
            <X size={16} />
          </button>
        </div>
        <label className="mt-4 block text-sm font-medium">
          Name
          <input name="name" required className="mt-1.5 w-full px-3 py-2 text-sm" />
        </label>
        <label className="mt-3 block text-sm font-medium">
          Slug
          <input name="slug" required className="mt-1.5 w-full px-3 py-2 font-mono text-sm" autoComplete="off" />
        </label>
        <label className="mt-3 block text-sm font-medium">
          Database URL
          <input name="databaseUrl" type="password" required className="mt-1.5 w-full px-3 py-2 font-mono text-sm" autoComplete="off" />
        </label>
        <label className="mt-3 block text-sm font-medium">
          JWT secret
          <input name="jwtSecret" type="password" required className="mt-1.5 w-full px-3 py-2 font-mono text-sm" autoComplete="off" />
        </label>
        <label className="mt-3 block text-sm font-medium">
          Anon key
          <input name="anonKey" type="password" required className="mt-1.5 w-full px-3 py-2 font-mono text-sm" autoComplete="off" />
        </label>
        <label className="mt-3 block text-sm font-medium">
          Service role key
          <input name="serviceRoleKey" type="password" required className="mt-1.5 w-full px-3 py-2 font-mono text-sm" autoComplete="off" />
        </label>
        <label className="mt-3 block text-sm font-medium">
          Project URL
          <input name="sourceUrl" placeholder="https://your-project.supabase.co" className="mt-1.5 w-full px-3 py-2 font-mono text-sm" autoComplete="off" />
        </label>
        <p className="text-muted mt-1 text-[13px]">Used to copy storage files. Leave it empty to copy only the database.</p>
        <label className="mt-3 block text-sm font-medium">
          Studio password
          <input name="studioPassword" type="password" className="mt-1.5 w-full px-3 py-2 text-sm" autoComplete="new-password" />
        </label>
        <p className="text-muted mt-1 text-[13px]">This is only the new Studio login. Account passwords stay the ones already in Auth.</p>
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(false)}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary btn-sm">
            <CloudDownload size={14} />
            Import
          </button>
        </div>
      </form>
    </div>
    ) : null}
    </>
  );
}
