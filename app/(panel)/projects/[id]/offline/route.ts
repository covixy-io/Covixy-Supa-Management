import { assertPanelAccess } from "@/lib/auth";
import { exportProjectArchive, getProject } from "@/lib/projects";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  await assertPanelAccess();
  const { id } = await context.params;
  const project = getProject(id);
  if (!project) return new Response("Not found", { status: 404 });
  const archive = exportProjectArchive(project.id);
  return new Response(JSON.stringify(archive, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="covixy-${project.slug}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
