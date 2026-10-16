import Link from "next/link";
import { RefreshCw } from "lucide-react";
import { refreshSpecsAction } from "@/app/actions";
import { PageHeader } from "@/components/page-header";
import { ServerPicture } from "@/components/server-picture";
import { StatusLamp } from "@/components/status-lamp";
import { listSamples, projectAnalytics, recordSampleIfDue } from "@/lib/analytics";
import { formatWhen } from "@/lib/format";
import { refreshServerSpecs } from "@/lib/specs-sync";

function pct(value: number): string {
  return `${Math.round(value * 100)}%`;
}

export default async function CapacityPage() {
  await refreshServerSpecs();
  recordSampleIfDue();
  const room = projectAnalytics();
  const samples = listSamples();
  const span = Math.max(room.availableMb, 1);
  const peak = Math.max(span, ...samples.map((sample) => sample.usedMb), 1);

  return (
    <div>
      <PageHeader
        title="Analytics"
        lede={`Capacity is the Coolify server minus the reserve. Load is the template estimate, about ${room.stackRamMb} MB for each active stack, not live container memory.`}
      >
        <form action={refreshSpecsAction}>
          <button type="submit" className="btn btn-ghost">
            <RefreshCw size={16} />
            Refresh specs
          </button>
        </form>
      </PageHeader>
      {room.usingDefaultRam ? (
        <p className="text-warn mt-3 text-sm">
          No Coolify specs are stored yet, so this uses the {room.serverRamMb} MB default. Connect the server in setup,
          or set SERVER_RAM_MB, before you rely on the check.
        </p>
      ) : null}

      <div className="mt-6">
        <ServerPicture
          serverRamMb={room.serverRamMb}
          reserveMb={room.reserveMb}
          usedMb={room.usedMb}
          freeMb={room.freeMb}
          specs={room.specs}
          reserveBasis={room.reserveBasis}
          projects={room.projects}
        />
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <div className="card p-4">
          <p className="text-muted text-xs font-medium">Capacity</p>
          <p className="mt-1 text-2xl font-bold">{room.availableMb} MB</p>
          <p className="text-muted text-xs">
            {room.serverRamMb} MB minus {room.reserveMb} MB reserved
          </p>
        </div>
        <div className="card p-4">
          <p className="text-muted text-xs font-medium">Load</p>
          <p className="mt-1 text-2xl font-bold">{room.usedMb} MB</p>
          <p className="text-muted text-xs">
            {room.activeStacks} active of {room.fits} that fit
          </p>
        </div>
        <div className="card p-4">
          <p className="text-muted text-xs font-medium">Headroom</p>
          <p className="mt-1 text-2xl font-bold">{room.freeMb} MB</p>
          <p className="text-muted text-xs">{room.canCreate ? "Another stack fits." : "Another stack does not fit."}</p>
        </div>
      </div>

      <div className="card mt-4 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="text-muted text-xs uppercase">
            <tr className="border-line border-b">
              <th className="px-4 py-3 font-medium">Project</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">RAM</th>
              <th className="hidden px-4 py-3 font-medium md:table-cell">Of capacity</th>
              <th className="hidden px-4 py-3 font-medium md:table-cell">Of load</th>
              <th className="px-4 py-3 font-medium">Containers</th>
            </tr>
          </thead>
          <tbody>
            {room.projects.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-muted px-4 py-6">
                  No projects yet.
                </td>
              </tr>
            ) : (
              room.projects.map((project) => (
                <tr key={project.id} className="border-line border-b last:border-0">
                  <td className="px-4 py-3">
                    <Link href={`/projects/${project.id}`} className="font-semibold hover:text-blue">
                      {project.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <StatusLamp status={project.status} />
                  </td>
                  <td className="px-4 py-3">{project.loadMb} MB</td>
                  <td className="hidden px-4 py-3 md:table-cell">{pct(project.capacityShare)}</td>
                  <td className="hidden px-4 py-3 md:table-cell">{pct(project.loadShare)}</td>
                  <td className="px-4 py-3">{project.containers}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="card mt-4 p-4">
        <p className="text-muted text-xs font-medium">Load history</p>
        {samples.length === 0 ? (
          <p className="text-muted mt-3 text-sm">No samples yet.</p>
        ) : (
          <div className="mt-4 flex h-32 items-end gap-1">
            {samples.map((sample) => (
              <div
                key={sample.at}
                className="relative h-full min-w-2 flex-1"
                title={`${formatWhen(sample.at)} · ${sample.usedMb} MB of ${sample.availableMb} MB capacity`}
              >
                <div
                  className="bg-blue absolute right-0 bottom-0 left-0 rounded-sm"
                  style={{ height: `${Math.max(4, (sample.usedMb / peak) * 100)}%` }}
                />
              </div>
            ))}
          </div>
        )}
        <p className="text-muted mt-3 text-xs">A sample is stored at most every five minutes. The bars are load against the capacity at that time.</p>
      </div>
    </div>
  );
}
