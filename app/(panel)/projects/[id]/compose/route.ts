import { assertPanelAccess } from "@/lib/auth";
import { renderCompose } from "@/lib/compose";
import { getProject } from "@/lib/projects";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  await assertPanelAccess();
  const { id } = await context.params;
  const project = getProject(id);
  if (!project) return new Response("Not found", { status: 404 });
  const yaml = renderCompose(project.slug);
  return new Response(yaml, {
    headers: {
      "Content-Type": "application/yaml; charset=utf-8",
      "Content-Disposition": `attachment; filename="supa-${project.slug}.yml"`,
      "Cache-Control": "no-store",
    },
  });
}
