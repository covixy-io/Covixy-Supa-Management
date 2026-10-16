import { recordSampleIfDue } from "@/lib/analytics";
import { composePlaceholders, renderCompose } from "@/lib/compose";
import {
  createService,
  deleteService,
  getService,
  hostsFromCoolifyService,
  listServices,
  readServiceEnvValues,
  restartOrStart,
  restartService,
  serviceReadiness,
  setServiceEnv,
  startService,
  stopService,
  updateServiceCompose,
  updateServiceUrls,
  coolifyMode,
} from "@/lib/coolify";
import { validateSlug } from "@/lib/hosts";
import {
  appendJobLog,
  claimJob,
  finishJob,
  getProject,
  getProjectBySlug,
  listProjects,
  readEnv,
  readSecrets,
  rememberRunningService,
  removeProject,
  updateProjectState,
  writeAudit,
} from "@/lib/projects";
import { panelApex } from "@/lib/settings";
import { scrubSecrets } from "@/lib/secrets";
import type { Job } from "@/lib/template";
import { describeAddresses } from "@/lib/urls";

const gate = globalThis as unknown as {
  __csmBusy?: boolean;
  __csmTimer?: ReturnType<typeof setInterval>;
};

function log(job: Job, secrets: string[], line: string): void {
  appendJobLog(job.id, scrubSecrets(line, secrets));
}

async function provision(job: Job): Promise<void> {
  const project = getProject(job.projectId || "");
  if (!project) throw new Error("Project disappeared before provisioning.");
  const secrets = readSecrets(project.id);
  const secretValues = Object.values(secrets);
  const addresses = describeAddresses({
    apiHost: project.apiHost,
    studioHost: project.studioHost,
    scheme: project.scheme,
    customDomain: project.customDomain,
    panelHost: project.panelHost,
  });

  updateProjectState(project.id, { status: "provisioning", error: null });
  log(job, secretValues, `mode ${coolifyMode()}`);
  log(job, secretValues, `api ${addresses.canonicalApiUrl}`);
  log(job, secretValues, `panel ${addresses.canonicalPanelUrl}`);
  log(job, secretValues, `template ${project.templateId} ${project.templateVersion}, postgres ${project.postgresMajor}`);

  const compose = renderCompose(project.slug);
  const env = readEnv(project.id);
  const missing = composePlaceholders(compose).filter((key) => !(key in env));
  if (missing.length) throw new Error(`Compose is missing env: ${missing.join(", ")}`);

  let uuid = project.coolifyServiceUuid;
  const existing = Boolean(uuid);
  if (!uuid) {
    log(job, secretValues, "creating Coolify service");
    uuid = await createService({
      slug: project.slug,
      name: project.name,
      compose,
      urls: addresses.coolifyUrls,
    });
    updateProjectState(project.id, { coolifyServiceUuid: uuid });
    log(job, secretValues, `service ${uuid}`);
  } else {
    log(job, secretValues, `updating service ${uuid}`);
    await updateServiceCompose(uuid, compose);
  }

  log(job, secretValues, "setting domains");
  await updateServiceUrls(uuid, addresses.coolifyUrls);
  if (project.keysLocal) {
    log(job, secretValues, "writing environment");
    await setServiceEnv(uuid, env);
  } else if (existing) {
    log(job, secretValues, "keeping the keys already stored on this Coolify service");
  } else {
    throw new Error("This panel does not hold the original keys, so it will not create a new service.");
  }
  log(job, secretValues, existing ? "restarting service" : "starting service");
  if (existing) await restartOrStart(uuid);
  else await startService(uuid);
  updateProjectState(project.id, { status: "starting", error: null });
  writeAudit("project.provisioned", project, `${coolifyMode()} ${uuid}`);
  log(job, secretValues, "Coolify queued the start. Images can take several minutes to download.");
}

async function pause(job: Job): Promise<void> {
  const project = getProject(job.projectId || "");
  if (!project) throw new Error("Project disappeared before pause.");
  if (!project.coolifyServiceUuid) throw new Error("This project has no Coolify service to stop.");
  const secrets = safeSecretValues(project.id);
  log(job, secrets, `stopping ${project.coolifyServiceUuid}`);
  await stopService(project.coolifyServiceUuid);
  updateProjectState(project.id, { status: "paused", error: null });
  writeAudit("project.paused", project, project.coolifyServiceUuid);
}

async function resume(job: Job): Promise<void> {
  const project = getProject(job.projectId || "");
  if (!project) throw new Error("Project disappeared before resume.");
  if (!project.coolifyServiceUuid) throw new Error("This project has no Coolify service to start.");
  const secrets = safeSecretValues(project.id);
  log(job, secrets, `starting ${project.coolifyServiceUuid}`);
  await startService(project.coolifyServiceUuid);
  updateProjectState(project.id, { status: "starting", error: null });
  writeAudit("project.resumed", project, project.coolifyServiceUuid);
}

async function syncEnv(job: Job): Promise<void> {
  const project = getProject(job.projectId || "");
  if (!project) throw new Error("Project disappeared before the env sync.");
  if (!project.keysLocal) {
    throw new Error("Restore the offline file before changing keys or addresses.");
  }
  const env = readEnv(project.id);
  const values = Object.values(env).map((item) => item.value);
  if (!project.coolifyServiceUuid) {
    log(job, values, "saved on the panel; no Coolify service to update yet");
    return;
  }
  log(job, values, "updating Coolify environment");
  await updateServiceUrls(
    project.coolifyServiceUuid,
    describeAddresses({
      apiHost: project.apiHost,
      studioHost: project.studioHost,
      scheme: project.scheme,
      customDomain: project.customDomain,
      panelHost: project.panelHost,
    }).coolifyUrls,
  );
  await setServiceEnv(project.coolifyServiceUuid, env);
  if (project.status === "running" || project.status === "starting") {
    log(job, values, "restarting so the new values apply");
    await restartService(project.coolifyServiceUuid);
    if (coolifyMode() === "live") updateProjectState(project.id, { status: "starting", error: null });
  }
  updateProjectState(project.id, { error: null });
  writeAudit("env.synced", project, project.coolifyServiceUuid);
}

async function remove(job: Job): Promise<void> {
  const project = getProject(job.projectId || "");
  if (!project) {
    log(job, [], "project already gone");
    return;
  }
  const secrets = safeSecretValues(project.id);
  if (project.coolifyServiceUuid && project.keysLocal) {
    log(job, secrets, `deleting ${project.coolifyServiceUuid} and its volumes`);
    await deleteService(project.coolifyServiceUuid);
  } else if (project.coolifyServiceUuid) {
    log(job, secrets, "keeping the Coolify service and its database; removing only the panel row");
  } else {
    log(job, secrets, "no Coolify service; removing the panel record");
  }
  writeAudit("project.deleted", project, project.coolifyServiceUuid || "panel record only");
  removeProject(project.id);
}

function safeSecretValues(projectId: string): string[] {
  try {
    return Object.values(readSecrets(projectId));
  } catch {
    return [];
  }
}

async function run(job: Job): Promise<void> {
  try {
    if (job.type === "provision") await provision(job);
    else if (job.type === "pause") await pause(job);
    else if (job.type === "resume") await resume(job);
    else if (job.type === "delete") await remove(job);
    else if (job.type === "sync-env") await syncEnv(job);
    else throw new Error(`Unknown job ${job.type}`);
    finishJob(job.id, "done");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const project = job.projectId ? getProject(job.projectId) : null;
    const secrets = project ? safeSecretValues(project.id) : [];
    const scrubbed = scrubSecrets(message, secrets);
    log(job, secrets, `failed: ${scrubbed}`);
    if (project && job.type === "sync-env") {
      updateProjectState(project.id, { error: scrubbed });
    } else if (project) {
      updateProjectState(project.id, { status: "failed", error: scrubbed });
    }
    if (project) writeAudit("project.failed", project, scrubSecrets(message, secrets));
    finishJob(job.id, "failed", scrubSecrets(message, secrets));
  }
}

const watch = globalThis as unknown as { __csmWatch?: number; __csmRecallAt?: number };

async function recallServices(): Promise<void> {
  const services = await listServices();
  for (const service of services) {
    const slug = service.name.startsWith("supa-") ? service.name.slice("supa-".length) : "";
    if (!slug || validateSlug(slug)) continue;
    if (getProjectBySlug(slug)?.coolifyServiceUuid) continue;
    let envValues: Record<string, string> = {};
    try {
      envValues = await readServiceEnvValues(service.uuid);
    } catch {
      envValues = {};
    }
    let detail: unknown = null;
    try {
      detail = await getService(service.uuid);
    } catch {
      detail = null;
    }
    const hosts = hostsFromCoolifyService(detail, slug, panelApex());
    rememberRunningService({
      slug,
      uuid: service.uuid,
      apiHost: hosts.apiHost,
      studioHost: hosts.studioHost,
      envValues,
    });
  }
}

async function recallOnce(): Promise<void> {
  if (coolifyMode() !== "live") return;
  const now = Date.now();
  if (watch.__csmRecallAt && now < watch.__csmRecallAt) return;
  watch.__csmRecallAt = now + 60_000;
  try {
    await recallServices();
    watch.__csmRecallAt = now + 10 * 60_000;
  } catch (error) {
    console.error(error);
  }
}

async function watchStarting(): Promise<void> {
  const starting = listProjects().filter((project) => project.status === "starting");
  if (!starting.length) return;
  const live = coolifyMode() === "live";
  const now = Date.now();
  if (live && watch.__csmWatch && now - watch.__csmWatch < 10_000) return;
  if (live) watch.__csmWatch = now;
  for (const project of starting) {
    if (coolifyMode() !== "live" || !project.coolifyServiceUuid || project.coolifyServiceUuid.startsWith("rehearsal-")) {
      updateProjectState(project.id, { status: "running", error: null });
      continue;
    }
    try {
      const ready = serviceReadiness(await getService(project.coolifyServiceUuid));
      if (ready === "running") updateProjectState(project.id, { status: "running", error: null });
      else if (ready === "failed") {
        updateProjectState(project.id, {
          status: "failed",
          error: "A container exited while starting. Open the service in Coolify and read the db and auth logs.",
        });
      }
    } catch {
      // A status check can fail while Coolify is still pulling images.
    }
  }
}

export async function processQueue(): Promise<void> {
  if (gate.__csmBusy) return;
  gate.__csmBusy = true;
  try {
    recordSampleIfDue();
    for (;;) {
      const job = claimJob();
      if (!job) break;
      await run(job);
    }
    await recallOnce();
    await watchStarting();
  } finally {
    gate.__csmBusy = false;
  }
}

export function startWorker(): void {
  if (gate.__csmTimer) clearInterval(gate.__csmTimer);
  gate.__csmTimer = setInterval(() => {
    void processQueue().catch((error) => {
      console.error(error);
    });
  }, 1000);
}
