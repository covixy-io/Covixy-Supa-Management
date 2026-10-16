"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { deleteLeftoverAction } from "@/app/actions";
import type { LeftoverService } from "@/lib/coolify";

export function LeftoverServices({ services }: { services: LeftoverService[] }) {
  if (!services.length) return null;
  return (
    <section className="mt-6 grid gap-3">
      <h2 className="text-lg font-semibold">Still on Coolify</h2>
      <p className="text-muted text-sm">
        These are Coolify services named supa- that this panel is not using. A previous stack has the same name as a project here and a different service. An untracked stack is on Coolify and is not in the list above.
      </p>
      {services.map((service) => (
        <LeftoverRow key={service.uuid} service={service} />
      ))}
    </section>
  );
}

function LeftoverRow({ service }: { service: LeftoverService }) {
  const [confirm, setConfirm] = useState("");
  return (
    <form action={deleteLeftoverAction} className="card flex flex-wrap items-end gap-3 px-4 py-4">
      <input type="hidden" name="uuid" value={service.uuid} />
      <input type="hidden" name="name" value={service.name} />
      <div className="min-w-0 flex-1">
        <p className="font-mono text-sm">{service.name}</p>
        <p className="text-muted mt-1 text-xs">
          {service.kind === "previous"
            ? `Older stack for ${service.slug}. The project in the list uses a different Coolify service.`
            : "Not attached to a project in this panel. Deleting it removes that service and its database."}
        </p>
        <label className="mt-3 block text-xs">
          <span className="text-muted font-medium">Type {service.name} to delete it</span>
          <input
            name="confirm"
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
            className="mt-1.5 w-full px-3 py-2 font-mono text-sm"
            autoComplete="off"
          />
        </label>
      </div>
      <button type="submit" disabled={confirm !== service.name} className="btn btn-danger">
        <Trash2 size={16} />
        Delete stack
      </button>
    </form>
  );
}
