"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { deleteProjectAction } from "@/app/actions";

export function RemoveProject({ id, slug, keysLocal }: { id: string; slug: string; keysLocal: boolean }) {
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState("");

  if (!open) {
    return (
      <button type="button" className="btn btn-ghost" onClick={() => setOpen(true)}>
        <Trash2 size={16} />
        Remove
      </button>
    );
  }

  return (
    <form action={deleteProjectAction} className="flex w-full flex-wrap items-end gap-2">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="slug" value={slug} />
      <label className="min-w-40 flex-1 text-xs">
        <span className="text-muted font-medium">
          Type {slug} to remove this project.
          {keysLocal ? " This also deletes its Coolify service and database volume." : " The Coolify service stays."}
        </span>
        <input
          name="confirm"
          value={confirm}
          onChange={(event) => setConfirm(event.target.value)}
          className="mt-1.5 w-full px-3 py-2 font-mono text-sm"
          autoComplete="off"
        />
      </label>
      <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)}>
        Cancel
      </button>
      <button type="submit" disabled={confirm !== slug} className="btn btn-danger">
        <Trash2 size={16} />
        Remove
      </button>
    </form>
  );
}
