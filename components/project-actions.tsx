"use client";

import { useState } from "react";
import { Pause, Play, RefreshCw, Trash2 } from "lucide-react";
import { deleteProjectAction, pauseProjectAction, provisionProjectAction, resumeProjectAction } from "@/app/actions";
import type { JobType } from "@/lib/template";

function HiddenId({ id, slug }: { id: string; slug?: string }) {
  return (
    <>
      <input type="hidden" name="id" value={id} />
      {slug ? <input type="hidden" name="slug" value={slug} /> : null}
    </>
  );
}

export function ProjectActions({
  id,
  slug,
  status,
  lastJob,
  keysLocal = true,
}: {
  id: string;
  slug: string;
  status: string;
  lastJob: JobType | null;
  keysLocal?: boolean;
}) {
  const [confirm, setConfirm] = useState("");
  const showPause = status === "running" || (status === "failed" && lastJob === "pause");
  const showResume = status === "paused" || (status === "failed" && lastJob === "resume");
  const showProvision = status === "failed" && (lastJob === "provision" || lastJob === null);
  const showDelete = status === "running" || status === "starting" || status === "paused" || status === "failed";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {showProvision ? (
          <form action={provisionProjectAction}>
            <HiddenId id={id} />
            <button type="submit" className="btn btn-primary">
              <RefreshCw size={16} />
              Provision again
            </button>
          </form>
        ) : null}
        {status === "running" || status === "starting" ? (
          <form action={provisionProjectAction}>
            <HiddenId id={id} />
            <button type="submit" className="btn btn-primary">
              <RefreshCw size={16} />
              Update stack
            </button>
          </form>
        ) : null}
        {showPause ? (
          <form action={pauseProjectAction}>
            <HiddenId id={id} />
            <button type="submit" className="btn btn-ghost">
              <Pause size={16} />
              Pause
            </button>
          </form>
        ) : null}
        {showResume ? (
          <form action={resumeProjectAction}>
            <HiddenId id={id} />
            <button type="submit" className="btn btn-primary">
              <Play size={16} />
              Resume
            </button>
          </form>
        ) : null}
      </div>
      <p className="text-muted text-sm">
        {keysLocal
          ? "Update stack sends the saved compose and keys again. It does not ask for them a second time. Coolify’s Deploy button can open an empty form and replace those keys, so use this button instead."
          : "Update stack sends the new compose and restarts the service. It leaves the keys already stored on that Coolify service."}
      </p>
      {showDelete ? (
        <form action={deleteProjectAction} className="card p-4">
          <HiddenId id={id} slug={slug} />
          <p className="text-sm">Delete removes the Coolify service and its database volume. Download an offline copy first if you want to restore the keys and environment later.</p>
          <label className="mt-3 block">
            <span className="text-muted text-xs font-medium">Type {slug} to confirm</span>
            <input
              name="confirm"
              value={confirm}
              onChange={(event) => setConfirm(event.target.value)}
              className="mt-1.5 w-full px-3 py-2 font-mono text-sm"
              autoComplete="off"
            />
          </label>
          <button type="submit" disabled={confirm !== slug} className="btn btn-danger mt-3">
            <Trash2 size={16} />
            Delete stack
          </button>
        </form>
      ) : null}
    </div>
  );
}
