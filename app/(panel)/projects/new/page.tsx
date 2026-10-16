import { ProjectForm } from "@/components/project-form";
import { capacitySnapshot } from "@/lib/projects";
import { panelApex } from "@/lib/settings";
import { TEMPLATE } from "@/lib/template";

export default function NewProjectPage() {
  const room = capacitySnapshot();

  return (
    <div>
      <h1 className="text-3xl font-bold">New project</h1>
      <p className="text-muted mt-2 max-w-xl text-sm">
        Generates a JWT secret, anon key, service-role key, and database password, then asks Coolify to deploy{" "}
        {TEMPLATE.id} {TEMPLATE.version}. Email confirmation starts off so the stack is usable before SMTP is set.
      </p>
      <div className="mt-8">
        <ProjectForm
          apex={panelApex()}
          canCreate={room.canCreate}
          freeMb={room.freeMb}
          stackRamMb={room.stackRamMb}
          serverRamMb={room.serverRamMb}
          usedMb={room.usedMb}
          reserveMb={room.reserveMb}
        />
      </div>
    </div>
  );
}
