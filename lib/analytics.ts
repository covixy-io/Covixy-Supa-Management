import { randomUUID } from "node:crypto";
import { getDb } from "@/lib/db";
import { capacitySnapshot, listProjects } from "@/lib/projects";
import { RAM_STATUSES, TEMPLATE, type Project } from "@/lib/template";

export type ProjectLoad = Project & {
  active: boolean;
  loadMb: number;
  capacityShare: number;
  loadShare: number;
  containers: number;
};

export type LoadSample = {
  at: string;
  usedMb: number;
  availableMb: number;
  activeStacks: number;
};

function isActive(project: Project): boolean {
  return (
    (RAM_STATUSES as readonly string[]).includes(project.status) ||
    (project.status === "failed" && Boolean(project.coolifyServiceUuid))
  );
}

export function projectAnalytics(): { projects: ProjectLoad[] } & ReturnType<typeof capacitySnapshot> {
  const snap = capacitySnapshot();
  const projects = listProjects().map((project) => {
    const active = isActive(project);
    const loadMb = active ? project.ramMb : 0;
    return {
      ...project,
      active,
      loadMb,
      capacityShare: snap.availableMb > 0 ? loadMb / snap.availableMb : 0,
      loadShare: snap.usedMb > 0 ? loadMb / snap.usedMb : 0,
      containers: active ? TEMPLATE.containers : 0,
    };
  });
  return { ...snap, projects };
}

export function recordSampleIfDue(): void {
  const last = getDb().prepare("SELECT at FROM load_samples ORDER BY at DESC LIMIT 1").get() as
    | { at: string }
    | undefined;
  if (last && Date.now() - new Date(last.at).getTime() < 5 * 60 * 1000) return;
  const snap = capacitySnapshot();
  getDb()
    .prepare(
      "INSERT INTO load_samples (id, at, used_mb, available_mb, active_stacks) VALUES (?, ?, ?, ?, ?)",
    )
    .run(randomUUID(), new Date().toISOString(), snap.usedMb, snap.availableMb, snap.activeStacks);
}

export function listSamples(limit = 24): LoadSample[] {
  const rows = getDb()
    .prepare("SELECT at, used_mb, available_mb, active_stacks FROM load_samples ORDER BY at DESC LIMIT ?")
    .all(limit) as { at: string; used_mb: number; available_mb: number; active_stacks: number }[];
  return rows
    .reverse()
    .map((row) => ({
      at: row.at,
      usedMb: row.used_mb,
      availableMb: row.available_mb,
      activeStacks: row.active_stacks,
    }));
}
