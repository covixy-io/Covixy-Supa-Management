import { RefreshCw } from "lucide-react";
import { refreshSpecsAction } from "@/app/actions";
import { CapacityTable } from "@/components/capacity-table";
import { PageHeader } from "@/components/page-header";
import { LoadHistory } from "@/components/load-history";
import { ServerPicture } from "@/components/server-picture";
import { listSamples, projectAnalytics, recordSampleIfDue } from "@/lib/analytics";
import { refreshServerSpecs } from "@/lib/specs-sync";

export default async function CapacityPage() {
  await refreshServerSpecs();
  recordSampleIfDue();
  const room = projectAnalytics();
  const samples = listSamples();

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

      <CapacityTable
        projects={room.projects.map((project) => ({
          id: project.id,
          name: project.name,
          status: project.status,
          loadMb: project.loadMb,
          capacityShare: project.capacityShare,
          loadShare: project.loadShare,
          containers: project.containers,
        }))}
      />

      <div className="mt-4">
        <LoadHistory samples={samples} capacityMb={room.availableMb} />
      </div>
    </div>
  );
}
