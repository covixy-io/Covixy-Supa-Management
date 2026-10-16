import { recordSampleIfDue } from "@/lib/analytics";
import { composePlaceholders, renderCompose } from "@/lib/compose";
import {
  containerReport,
  createService,
  deleteService,
  deleteServicesNamed,
  exitedContainers,
  releaseDomains,
  getService,
  hostsFromCoolifyService,
  leftoverServices,
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

  const compose = renderCompose(project.slug, project.volumeKey);
  const env = readEnv(project.id);
  const missing = composePlaceholders(compose).filter((key) => !(key in env));
  if (missing.length) throw new Error(`Compose is missing env: ${missing.join(", ")}`);

  let uuid = project.coolifyServiceUuid;
  const existing = Boolean(uuid);
  if (!uuid) {
    log(job, secretValues, "removing any previous service with this name or this domain, including its database");
    const keep = new Set(
      listProjects().map((item) => item.coolifyServiceUuid).filter((uuid): uuid is string => Boolean(uuid)),
    );
    await releaseDomains(
      [addresses.publicApiHost, addresses.effectivePanelHost, project.apiHost, project.studioHost, project.customDomain || "", project.panelHost || ""],
      keep,
    );
    await deleteServicesNamed(`supa-${project.slug}`);
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
  if (project.coolifyServiceUuid) {
    log(job, secrets, `deleting ${project.coolifyServiceUuid} and its volumes`);
    await deleteService(project.coolifyServiceUuid);
  }
  await deleteServicesNamed(`supa-${project.slug}`);
  log(job, secrets, "Coolify service and database removed");
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

async function dropPreviousServices(): Promise<void> {
  if (coolifyMode() !== "live") return;
  const previous = leftoverServices(
    await listServices(),
    listProjects().map((project) => ({ slug: project.slug, coolifyServiceUuid: project.coolifyServiceUuid })),
  ).filter((service) => service.kind === "previous");
  for (const service of previous) await deleteService(service.uuid);
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
  const live = coolifyMode() === "live";
  const starting = listProjects().filter(
    (project) => project.status === "starting" || (live && project.status === "failed" && project.coolifyServiceUuid),
  );
  if (!starting.length) return;
  const now = Date.now();
  if (live && watch.__csmWatch && now - watch.__csmWatch < 10_000) return;
  if (live) watch.__csmWatch = now;
  for (const project of starting) {
    if (coolifyMode() !== "live" || !project.coolifyServiceUuid || project.coolifyServiceUuid.startsWith("rehearsal-")) {
      updateProjectState(project.id, { status: "running", error: null });
      continue;
    }
    try {
      const payload = await getService(project.coolifyServiceUuid);
      const ready = serviceReadiness(payload);
      const report = containerReport(payload);
      if (ready === "running") {
        updateProjectState(project.id, { status: "running", error: null });
        continue;
      }
      if (ready === "failed") {
        const started = new Date(project.bootAt || project.updatedAt).getTime();
        const waitedLong = Number.isFinite(started) && Date.now() - started >= 6 * 60 * 1000;
        if (!waitedLong) continue;
        const names = exitedContainers(payload);
        const who = names.length ? names.join(", ") : "A container";
        updateProjectState(project.id, {
          status: "failed",
          error: `${who} exited. ${report}`,
        });
        continue;
      }
      const note = `Waiting on ${report}.`;
      if (project.error !== note) updateProjectState(project.id, { error: note });
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (message.startsWith("Coolify 404")) {
        updateProjectState(project.id, {
          status: "failed",
          error: "Coolify returned 404 for this service. Remove the project and create it again.",
        });
      }
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
    try {
      await dropPreviousServices();
    } catch (error) {
      console.error(error);
    }
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
