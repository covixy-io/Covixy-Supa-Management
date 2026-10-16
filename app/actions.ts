"use server";

import { revalidatePath } from "next/cache";
import { cookies, headers } from "next/headers";
import { redirect, unstable_rethrow } from "next/navigation";
import { assertPanelAccess, LOCK_COOKIE, SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth";
import { coolifyMode, deleteService, leftoverServices, listServers, listServices, persistInstallEnv } from "@/lib/coolify";
import {
  copyProject,
  createImportedProject,
  createProject,
  getProject,
  listProjects,
  PanelError,
  readEnvValue,
  restoreProject,
  updateProjectAddresses,
  requestDelete,
  requestPause,
  requestProvision,
  requestResume,
  revealSecret,
  updateEnvValue,
  type SecretKind,
} from "@/lib/projects";
import { signSession } from "@/lib/session";
import { refreshServerSpecs } from "@/lib/specs-sync";
import {
  completeSetup,
  coolifyConfig,
  coolifyToken,
  panelApex,
  serverSessionSecret,
  SetupError,
  updateCoolifyConnection,
  verifyPanelPassword,
} from "@/lib/settings";
import { assertCloudKeys, parseDatabaseUrl } from "@/lib/restore-sql";
import { processQueue } from "@/lib/worker";

export type ActionState = { error: string } | null;

function message(error: unknown): string {
  if (error instanceof PanelError || error instanceof SetupError) return error.message;
  if (error instanceof Error) return error.message;
  return "Something went wrong.";
}

export async function loginAction(formData: FormData): Promise<void> {
  const password = String(formData.get("password") ?? "");
  if (!verifyPanelPassword(password)) redirect("/login?error=1");
  const jar = await cookies();
  jar.set(SESSION_COOKIE, await signSession(serverSessionSecret()), sessionCookieOptions());
  redirect("/projects");
}

export async function logoutAction(): Promise<void> {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
  redirect("/login");
}

export async function createProjectAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await assertPanelAccess();
  try {
    await refreshServerSpecs();
    const project = createProject({
      name: String(formData.get("name") ?? ""),
      slug: String(formData.get("slug") ?? ""),
      scheme: String(formData.get("scheme") ?? "https"),
      customDomain: String(formData.get("customDomain") ?? ""),
      panelHost: String(formData.get("panelHost") ?? ""),
    });
    try {
      await processQueue();
    } catch {
      // The project page shows the failed job.
    }
    redirect(`/projects/${project.id}`);
  } catch (error) {
    unstable_rethrow(error);
    return { error: message(error) };
  }
}

async function runProjectAction(work: () => void, id: string): Promise<void> {
  work();
  try {
    await processQueue();
  } catch {
    // Status is stored on the project.
  }
  redirect(`/projects/${id}`);
}

export async function pauseProjectAction(formData: FormData): Promise<void> {
  await assertPanelAccess();
  const id = String(formData.get("id") ?? "");
  try {
    await runProjectAction(() => requestPause(id), id);
  } catch (error) {
    unstable_rethrow(error);
    redirect(`/projects/${id}?error=${encodeURIComponent(message(error))}`);
  }
}

export async function resumeProjectAction(formData: FormData): Promise<void> {
  await assertPanelAccess();
  const id = String(formData.get("id") ?? "");
  try {
    await runProjectAction(() => requestResume(id), id);
  } catch (error) {
    unstable_rethrow(error);
    redirect(`/projects/${id}?error=${encodeURIComponent(message(error))}`);
  }
}

export async function deleteProjectAction(formData: FormData): Promise<void> {
  await assertPanelAccess();
  const id = String(formData.get("id") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  const slug = String(formData.get("slug") ?? "");
  if (confirm !== slug) redirect(`/projects/${id}?error=${encodeURIComponent("Type the slug to delete this project.")}`);
  try {
    requestDelete(id);
    try {
      await processQueue();
    } catch {
      redirect(`/projects/${id}`);
    }
    if (getProject(id)) redirect(`/projects/${id}`);
    redirect("/projects");
  } catch (error) {
    unstable_rethrow(error);
    redirect(`/projects/${id}?error=${encodeURIComponent(message(error))}`);
  }
}

export async function deleteLeftoverAction(formData: FormData): Promise<void> {
  await assertPanelAccess();
  const uuid = String(formData.get("uuid") ?? "");
  const name = String(formData.get("name") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  if (!uuid || confirm !== name) {
    redirect(`/projects?error=${encodeURIComponent("Type the Coolify service name to delete that stack.")}`);
  }
  try {
    const match = leftoverServices(
      await listServices(),
      listProjects().map((project) => ({ slug: project.slug, coolifyServiceUuid: project.coolifyServiceUuid })),
    ).find((service) => service.uuid === uuid && service.name === name);
    if (!match) redirect(`/projects?error=${encodeURIComponent("That Coolify service is already gone.")}`);
    await deleteService(uuid);
    redirect("/projects");
  } catch (error) {
    unstable_rethrow(error);
    redirect(`/projects?error=${encodeURIComponent(message(error))}`);
  }
}

export async function bulkProjectsAction(formData: FormData): Promise<void> {
  await assertPanelAccess();
  const op = String(formData.get("op") ?? "");
  const ids = formData.getAll("id").map((value) => String(value)).filter(Boolean);
  if (!ids.length) redirect(`/projects?error=${encodeURIComponent("Select at least one project.")}`);
  if (op === "delete" && String(formData.get("confirm") ?? "") !== "delete") {
    redirect(`/projects?error=${encodeURIComponent("Type delete to remove the selected projects.")}`);
  }
  const skipped: string[] = [];
  let done = 0;
  for (const id of ids) {
    const project = getProject(id);
    if (!project) continue;
    try {
      if (op === "pause") {
        if (project.status !== "running") {
          skipped.push(`${project.slug} is ${project.status}`);
          continue;
        }
        requestPause(id);
      } else if (op === "start") {
        if (project.status === "paused" || project.status === "failed") requestResume(id);
        else if (project.status === "queued") requestProvision(id);
        else {
          skipped.push(`${project.slug} is ${project.status}`);
          continue;
        }
      } else if (op === "delete") {
        requestDelete(id);
      } else {
        redirect(`/projects?error=${encodeURIComponent("Unknown bulk action.")}`);
      }
      done += 1;
    } catch (error) {
      unstable_rethrow(error);
      skipped.push(message(error));
    }
  }
  if (done) {
    try {
      await processQueue();
    } catch {
      // Each project keeps the status the queue stored.
    }
  }
  const summary = [`Updated ${done}`, skipped.length ? `skipped ${skipped.length}: ${skipped.slice(0, 4).join(", ")}` : ""]
    .filter(Boolean)
    .join(". ");
  redirect(`/projects?notice=${encodeURIComponent(summary)}`);
}

export async function provisionProjectAction(formData: FormData): Promise<void> {
  await assertPanelAccess();
  const id = String(formData.get("id") ?? "");
  try {
    await runProjectAction(() => requestProvision(id), id);
  } catch (error) {
    unstable_rethrow(error);
    redirect(`/projects/${id}?error=${encodeURIComponent(message(error))}`);
  }
}

export async function updateAddressesAction(
  projectId: string,
  input: { scheme: string; customDomain: string; panelHost: string },
): Promise<{ error?: string }> {
  await assertPanelAccess();
  try {
    updateProjectAddresses(projectId, input);
    try {
      await processQueue();
    } catch {
      // The project page shows the sync error.
    }
    return {};
  } catch (error) {
    return { error: message(error) };
  }
}

export async function importSupabaseAction(formData: FormData): Promise<void> {
  await assertPanelAccess();
  const name = String(formData.get("name") || "");
  const slug = String(formData.get("slug") || "");
  const connectionString = String(formData.get("databaseUrl") || "");
  const jwtSecret = String(formData.get("jwtSecret") || "");
  const anonKey = String(formData.get("anonKey") || "");
  const serviceRoleKey = String(formData.get("serviceRoleKey") || "");
  const studioPassword = String(formData.get("studioPassword") || "");
  const sourceApiUrl = String(formData.get("sourceUrl") || "");
  try {
    parseDatabaseUrl(connectionString);
    assertCloudKeys(jwtSecret, anonKey, serviceRoleKey);
    if (sourceApiUrl && !/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(sourceApiUrl.trim())) {
      throw new PanelError("Project URL should look like https://your-project.supabase.co.");
    }
    const requestHeaders = await headers();
    const host = requestHeaders.get("x-forwarded-host") || requestHeaders.get("host") || "";
    if (!host) throw new PanelError("Open this panel in the browser and run the import again.");
    const proto = requestHeaders.get("x-forwarded-proto") || (host.startsWith("localhost") ? "http" : "https");
    const project = createImportedProject({
      name,
      slug,
      connectionString,
      jwtSecret,
      anonKey,
      serviceRoleKey,
      studioPassword,
      sourceApiUrl,
      panelBaseUrl: `${proto}://${host}`,
    });
    try {
      await processQueue();
    } catch {
      // The project page shows the failed job.
    }
    revalidatePath("/projects");
    redirect(`/projects/${project.id}`);
  } catch (error) {
    unstable_rethrow(error);
    redirect(`/projects?error=${encodeURIComponent(message(error))}`);
  }
}

export async function copyProjectAction(formData: FormData): Promise<void> {
  await assertPanelAccess();
  const id = String(formData.get("id") || "");
  const name = String(formData.get("name") || "");
  const slug = String(formData.get("slug") || "");
  try {
    const project = copyProject(id, { name, slug });
    try {
      await processQueue();
    } catch {
      // The project page shows the failed job.
    }
    revalidatePath("/projects");
    redirect(`/projects/${project.id}`);
  } catch (error) {
    unstable_rethrow(error);
    redirect(`/projects?error=${encodeURIComponent(message(error))}`);
  }
}

export async function restoreProjectAction(payload: string, slug: string): Promise<{ error?: string }> {
  await assertPanelAccess();
  try {
    if (payload.length > 500_000) return { error: "That offline file is too large." };
    await refreshServerSpecs();
    const project = restoreProject(JSON.parse(payload) as unknown, slug);
    try {
      await processQueue();
    } catch {
      // The project page shows the failed job.
    }
    redirect(`/projects/${project.id}`);
  } catch (error) {
    unstable_rethrow(error);
    return { error: message(error) };
  }
}

export async function revealSecretAction(
  projectId: string,
  kind: SecretKind,
): Promise<{ value?: string; error?: string }> {
  await assertPanelAccess();
  try {
    return { value: revealSecret(projectId, kind) };
  } catch (error) {
    return { error: message(error) };
  }
}

async function keepInstallAcrossRedeploy(input: {
  apex?: string;
  url?: string;
  token?: string;
  project?: string;
  server?: string;
  environment?: string;
  password?: string;
}): Promise<void> {
  const plain = (value: string) => ({ value, secret: false });
  const secret = (value: string) => ({ value, secret: true });
  await persistInstallEnv({
    PANEL_INSTALLED: plain("1"),
    ...(input.apex ? { APEX_DOMAIN: plain(input.apex) } : {}),
    ...(input.url ? { COOLIFY_API_URL: plain(input.url) } : {}),
    ...(input.token ? { COOLIFY_API_TOKEN: secret(input.token) } : {}),
    ...(input.project ? { COOLIFY_PROJECT_UUID: plain(input.project) } : {}),
    ...(input.server ? { COOLIFY_SERVER_UUID: plain(input.server) } : {}),
    ...(input.environment ? { COOLIFY_ENVIRONMENT_NAME: plain(input.environment) } : {}),
    ...(input.password ? { PANEL_PASSWORD: secret(input.password) } : {}),
  });
}

export async function setupAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const result = completeSetup({
      apexDomain: String(formData.get("apex") ?? ""),
      serverName: String(formData.get("serverName") ?? ""),
      serverRamMb: Number(formData.get("ram") ?? ""),
      serverReserveMb: Number(formData.get("reserve") ?? ""),
      password: String(formData.get("password") ?? ""),
      coolifyApiUrl: String(formData.get("coolifyUrl") ?? ""),
      coolifyApiToken: String(formData.get("coolifyToken") ?? ""),
      coolifyProjectUuid: String(formData.get("coolifyProject") ?? ""),
      coolifyServerUuid: String(formData.get("coolifyServer") ?? ""),
      coolifyEnvironmentName: String(formData.get("coolifyEnvironment") ?? ""),
    });
    const jar = await cookies();
    if (result.lock) {
      jar.set(LOCK_COOKIE, "1", { ...sessionCookieOptions(), maxAge: 60 * 60 * 24 * 365 });
      jar.set(SESSION_COOKIE, await signSession(serverSessionSecret()), sessionCookieOptions());
    }
    await keepInstallAcrossRedeploy({
      apex: String(formData.get("apex") ?? ""),
      url: String(formData.get("coolifyUrl") ?? ""),
      token: String(formData.get("coolifyToken") ?? ""),
      project: String(formData.get("coolifyProject") ?? ""),
      server: String(formData.get("coolifyServer") ?? ""),
      environment: String(formData.get("coolifyEnvironment") ?? ""),
      password: String(formData.get("password") ?? ""),
    });
    await refreshServerSpecs();
    redirect("/projects");
  } catch (error) {
    unstable_rethrow(error);
    return { error: message(error) };
  }
}

export async function readEnvValueAction(
  projectId: string,
  key: string,
): Promise<{ value?: string; error?: string }> {
  await assertPanelAccess();
  try {
    return { value: readEnvValue(projectId, key) };
  } catch (error) {
    return { error: message(error) };
  }
}

export async function updateEnvAction(
  projectId: string,
  key: string,
  value: string,
): Promise<{ error?: string }> {
  await assertPanelAccess();
  try {
    updateEnvValue(projectId, key, value);
    try {
      await processQueue();
    } catch {
      // The project page shows the sync error.
    }
    return {};
  } catch (error) {
    return { error: message(error) };
  }
}

export async function refreshSpecsAction(): Promise<void> {
  await assertPanelAccess();
  await refreshServerSpecs();
  revalidatePath("/capacity");
  revalidatePath("/settings");
  revalidatePath("/projects/new");
}

export async function updateCoolifyAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await assertPanelAccess();
  try {
    updateCoolifyConnection({
      url: String(formData.get("coolifyUrl") ?? ""),
      token: String(formData.get("coolifyToken") ?? ""),
      project: String(formData.get("coolifyProject") ?? ""),
      server: String(formData.get("coolifyServer") ?? ""),
      environment: String(formData.get("coolifyEnvironment") ?? ""),
    });
    const saved = coolifyConfig();
    await keepInstallAcrossRedeploy({
      apex: panelApex(),
      url: saved.url,
      token: coolifyToken(),
      project: saved.project,
      server: saved.server,
      environment: saved.environment,
    });
    revalidatePath("/settings");
    revalidatePath("/projects");
    return null;
  } catch (error) {
    unstable_rethrow(error);
    return { error: message(error) };
  }
}

export async function checkCoolifyAction(): Promise<{ ok: true; servers: { name: string; uuid: string }[] } | { ok: false; error: string }> {
  await assertPanelAccess();
  try {
    if (coolifyMode() !== "live") {
      return { ok: false, error: "Set the Coolify URL, token, project, and server before checking." };
    }
    const servers = await listServers();
    await refreshServerSpecs();
    return { ok: true, servers };
  } catch (error) {
    return { ok: false, error: message(error) };
  }
}

