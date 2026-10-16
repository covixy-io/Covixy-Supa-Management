import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { capacity } from "../lib/capacity.ts";
import { reserveFromSpecs, specsFromCoolify } from "../lib/server-specs.ts";
import { composePlaceholders, renderCompose, stackEnv } from "../lib/compose.ts";
import { hostsFor, singleLabelHosts, validateApex, validateSlug } from "../lib/hosts.ts";
import { containerReport, hostsFromCoolifyService, leftoverServices, serviceReadiness } from "../lib/coolify.ts";
import { describeAddresses } from "../lib/urls.ts";
import { decodeJwtPayload, generateStackSecrets, scrubSecrets, signJwt } from "../lib/secrets.ts";

test("keys are signed for anon and service_role and expire after 2030", () => {
  const secrets = generateStackSecrets();
  for (const [token, role] of [
    [secrets.anonKey, "anon"],
    [secrets.serviceRoleKey, "service_role"],
  ] as const) {
    const payload = decodeJwtPayload(token);
    assert.equal(payload.role, role);
    assert.equal(payload.iss, "supabase");
    assert.equal(token, signJwt(payload, secrets.jwtSecret));
    assert.ok(Number(payload.exp) > Date.parse("2030-01-01") / 1000);
  }
  assert.ok(secrets.postgresPassword.length >= 24);
  assert.equal(secrets.realtimeDbEncKey.length, 16);
  assert.equal(secrets.dashboardUsername, "supabase");
});

test("hosts stay one label under the zone", () => {
  assert.equal(validateSlug("acme"), null);
  assert.ok(validateSlug("1acme"));
  assert.ok(validateSlug("studio"));
  assert.deepEqual(hostsFor("acme", "covixy.com"), {
    apiHost: "acme.covixy.com",
    studioHost: "acme-studio.covixy.com",
  });
  assert.equal(singleLabelHosts("acme", "covixy.com"), true);
  const both = describeAddresses({
    apiHost: "acme.covixy.com",
    studioHost: "acme-studio.covixy.com",
    scheme: "both",
    customDomain: "api.acme.test",
    panelHost: "panel.acme.test",
  });
  assert.equal(both.canonicalApiUrl, "https://api.acme.test");
  assert.equal(both.canonicalPanelUrl, "https://panel.acme.test");
  assert.equal(
    serviceReadiness({
      applications: [{ status: "running:unknown" }, { status: "running:healthy" }],
    }),
    "running",
  );
  assert.equal(serviceReadiness({ applications: [{ status: "starting:unknown" }] }), "starting");
  assert.equal(
    serviceReadiness({
      applications: [{ status: "running:healthy" }],
      databases: [{ status: "running:healthy" }],
    }),
    "running",
  );
  assert.equal(
    serviceReadiness({
      applications: [{ status: "running:unhealthy" }, { status: "running:unknown" }],
    }),
    "starting",
  );
  assert.equal(serviceReadiness({ status: "exited" }), "failed");
  assert.equal(
    serviceReadiness({ applications: [{ status: "exited" }, { status: "pulling" }] }),
    "starting",
  );
  assert.equal(
    containerReport({
      applications: [
        { name: "db", status: "running:unhealthy" },
        { name: "gateway", status: "created" },
      ],
    }),
    "db running:unhealthy, gateway created",
  );
  assert.deepEqual(
    hostsFromCoolifyService(
      {
        applications: [
          { name: "gateway", fqdn: "https://demo.carsgames.org" },
          { name: "studio", fqdn: "https://demo-studio.carsgames.org" },
        ],
      },
      "demo",
      "carsgames.org",
    ),
    { apiHost: "demo.carsgames.org", studioHost: "demo-studio.carsgames.org" },
  );
  assert.deepEqual(both.coolifyUrls, [
    { name: "gateway", url: "https://api.acme.test,http://api.acme.test" },
    { name: "studio", url: "https://panel.acme.test,http://panel.acme.test" },
  ]);
  assert.ok(both.redirectUrls.includes("http://api.acme.test"));
  assert.equal(both.apiUrls.includes("https://acme.covixy.com"), false);
  assert.equal(validateApex("covixy.com"), null);
  assert.ok(validateApex("https://covixy.com"));
});

test("a second Coolify service with the same name is the previous stack", () => {
  const rows = leftoverServices(
    [
      { name: "supa-demo", uuid: "current" },
      { name: "supa-demo", uuid: "old" },
      { name: "supa-other", uuid: "kept" },
    ],
    [{ slug: "demo", coolifyServiceUuid: "current" }],
  );
  assert.equal(rows.find((row) => row.uuid === "current"), undefined);
  assert.equal(rows.find((row) => row.uuid === "old")?.kind, "previous");
  assert.equal(rows.find((row) => row.uuid === "kept")?.kind, "untracked");
});

test("compose placeholders are all given to Coolify", () => {
  const secrets = generateStackSecrets();
  const yaml = renderCompose("acme");
  const env = stackEnv({ name: "Acme", slug: "acme", apiUrl: "https://acme.covixy.com", secrets });
  const missing = [...new Set(composePlaceholders(yaml))].filter((key) => !(key in env));
  assert.deepEqual(missing, []);
  assert.match(yaml, /name: supa-acme/);
  assert.match(yaml, /\$\$child/);
  assert.match(yaml, /child=\$\$!/);
  assert.equal(yaml.includes("${SERVICE_ROLE_KEY}"), false);
  assert.match(yaml, /\$\{SUPABASE_SERVICE_ROLE_KEY\}/);
  assert.equal(yaml.includes("csm-"), false);
  assert.match(renderCompose("acme", "abc"), /name: csm-abc-db/);
  assert.match(yaml, /roles-applied/);
  assert.match(yaml, /SNIPPETS_MANAGEMENT_FOLDER/);
  assert.match(yaml, /supabase\/gotrue:v2\.197\.0/);
  assert.equal(yaml.includes(secrets.postgresPassword), false);
  assert.equal(yaml.includes(secrets.serviceRoleKey), false);
  const blobs = [...yaml.matchAll(/echo '([A-Za-z0-9+/=]+)'/g)].map((match) =>
    Buffer.from(match[1] || "", "base64").toString("utf8"),
  );
  const roles = blobs[0] || "";
  assert.match(roles, /\$POSTGRES_PASSWORD/);
  assert.match(roles, /\\gexec/);
  assert.equal(roles.includes("DO $do$"), false);
  assert.match(roles, /supabase_storage_admin/);
  assert.match(roles, /supabase_admin/);
  assert.ok(blobs.some((text) => text.includes("banned_until")));
  assert.ok(blobs.some((text) => text.includes("OWNER TO supabase_auth_admin")));
  assert.match(yaml, /SUPABASE_PUBLISHABLE_KEY/);
  assert.equal(scrubSecrets(`failed ${secrets.serviceRoleKey}`, [secrets.serviceRoleKey]).includes("eyJ"), false);
  assert.equal(scrubSecrets("template covixy-supabase", ["supabase", secrets.serviceRoleKey]), "template covixy-supabase");
});

test("capacity keeps a reserve", () => {
  const specs = specsFromCoolify({
    name: "edge",
    server_metadata: { memory_bytes: 8192 * 1024 * 1024, cpus: 4, os: "Ubuntu" },
    settings: { docker_version: "27.0.0", is_reachable: true },
  });
  assert.equal(specs?.memoryMb, 8192);
  assert.equal(specs?.cpus, 4);
  assert.equal(reserveFromSpecs(8192, 4), 1638);
  assert.equal(reserveFromSpecs(4096, 2), 1024);
  assert.equal(specsFromCoolify({ name: "empty" }), null);
  const first = capacity({ serverRamMb: 8192, reserveMb: 2048, stackRamMb: 1536, activeStacks: 0 });
  assert.equal(first.canCreate, true);
  const full = capacity({ serverRamMb: 8192, reserveMb: 2048, stackRamMb: 1536, activeStacks: 4 });
  assert.equal(full.freeMb, 0);
  assert.equal(full.canCreate, false);
});

test("rehearsal create, pause, resume, and delete", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "csm-"));
  process.env.PANEL_DB_PATH = path.join(dir, "panel.db");
  process.env.PANEL_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString("base64");
  process.env.APEX_DOMAIN = "covixy.com";
  process.env.SERVER_RAM_MB = "4096";
  process.env.SERVER_RESERVE_MB = "2048";
  delete process.env.COOLIFY_API_URL;
  delete process.env.COOLIFY_API_TOKEN;

  const db = await import("../lib/db.ts");
  const crypto = await import("../lib/crypto.ts");
  db.resetDbForTests();
  crypto.resetEncryptionKeyForTests();

  const projects = await import("../lib/projects.ts");
  const worker = await import("../lib/worker.ts");

  const created = projects.createProject({ name: "Acme", slug: "acme" });
  await worker.processQueue();
  const running = projects.getProject(created.id);
  assert.equal(running?.status, "running");
  assert.equal(running?.keysLocal, true);
  assert.equal(running?.coolifyServiceUuid, "rehearsal-acme");
  assert.equal(running?.volumeKey, created.id);
  assert.equal(running?.postgresMajor, 17);

  const revealed = projects.revealSecret(created.id, "serviceRole");
  assert.equal(decodeJwtPayload(revealed).role, "service_role");
  assert.equal(JSON.stringify(running).includes(revealed), false);

  const publicEnv = projects.listEnvPublic(created.id);
  assert.equal(publicEnv.find((row) => row.key === "SERVICE_ROLE_KEY")?.value, null);
  assert.equal(publicEnv.find((row) => row.key === "REGION")?.value, "local");
  projects.updateEnvValue(created.id, "REGION", "eu");
  await worker.processQueue();
  assert.equal(projects.getProject(created.id)?.status, "running");
  assert.equal(projects.readEnvValue(created.id, "REGION"), "eu");

  projects.updateProjectAddresses(created.id, {
    scheme: "both",
    customDomain: "api.acme.test",
    panelHost: "panel.acme.test",
  });
  await worker.processQueue();
  assert.equal(projects.getProject(created.id)?.status, "running");
  assert.equal(projects.readEnvValue(created.id, "API_EXTERNAL_URL"), "https://api.acme.test");
  assert.match(projects.readEnvValue(created.id, "ADDITIONAL_REDIRECT_URLS"), /http:\/\/api\.acme\.test/);

  const archive = projects.exportProjectArchive(created.id);
  assert.equal(archive.format, "covixy-supa-offline");
  assert.equal(archive.env.REGION.value, "eu");
  assert.equal(archive.env.SERVICE_ROLE_KEY.secret, true);
  assert.equal(archive.env.SERVICE_ROLE_KEY.value, revealed);
  assert.equal(JSON.stringify(projects.listEnvPublic(created.id)).includes(revealed), false);

  assert.throws(
    () => projects.createProject({ name: "Acme Studio", slug: "acme-studio" }),
    (error: Error) =>
      /already used/.test(error.message) && /1 project/.test(error.message) && /Acme \(acme, running\)/.test(error.message),
  );

  projects.requestPause(created.id);
  await worker.processQueue();
  assert.equal(projects.getProject(created.id)?.status, "paused");

  projects.requestResume(created.id);
  await worker.processQueue();
  assert.equal(projects.getProject(created.id)?.status, "running");

  projects.requestDelete(created.id);
  await worker.processQueue();
  assert.equal(projects.getProject(created.id), null);
  assert.ok(projects.listAudit().some((entry) => entry.action === "project.deleted"));

  const again = projects.createProject({ name: "Beta", slug: "beta" });
  await worker.processQueue();
  assert.throws(() => projects.createProject({ name: "Gamma", slug: "gamma" }), /Not enough RAM/);
  projects.requestDelete(again.id);
  await worker.processQueue();

  const restored = projects.restoreProject(archive);
  await worker.processQueue();
  assert.equal(projects.getProject(restored.id)?.status, "running");
  assert.equal(projects.getProject(restored.id)?.scheme, "both");
  assert.equal(projects.getProject(restored.id)?.customDomain, "api.acme.test");
  assert.equal(projects.readEnvValue(restored.id, "API_EXTERNAL_URL"), "https://api.acme.test");
  assert.equal(projects.readEnvValue(restored.id, "REGION"), "eu");
  assert.equal(projects.revealSecret(restored.id, "serviceRole"), revealed);
  assert.throws(() => projects.restoreProject(archive), /already used/);
  assert.throws(() => projects.restoreProject({ format: "nope" }), /offline project/);

  projects.requestDelete(restored.id);
  await worker.processQueue();
  const leftover = projects.rememberRunningService({
    slug: "oldstack",
    uuid: "old-uuid",
    apiHost: "oldstack.covixy.com",
    studioHost: "oldstack-studio.covixy.com",
    envValues: {},
  });
  assert.equal(leftover?.keysLocal, false);
  projects.requestDelete(leftover!.id);
  await worker.processQueue();
  assert.equal(projects.getProjectBySlug("oldstack"), null);

  const recreated = projects.createProject({ name: "Oldstack", slug: "oldstack" });
  const attached = projects.rememberRunningService({
    slug: "oldstack",
    uuid: "old-uuid",
    apiHost: "oldstack.covixy.com",
    studioHost: "oldstack-studio.covixy.com",
    envValues: {},
  });
  assert.equal(attached?.id, recreated.id);
  assert.equal(attached?.coolifyServiceUuid, null);
  await worker.processQueue();
  assert.equal(projects.getProject(recreated.id)?.coolifyServiceUuid, "rehearsal-oldstack");
  assert.equal(projects.getProject(recreated.id)?.keysLocal, true);
});

test("settings save the full Coolify token", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "csm-token-"));
  process.env.PANEL_DB_PATH = path.join(dir, "panel.db");
  process.env.PANEL_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
  delete process.env.COOLIFY_API_URL;
  delete process.env.COOLIFY_API_TOKEN;
  delete process.env.COOLIFY_PROJECT_UUID;
  delete process.env.COOLIFY_SERVER_UUID;
  delete process.env.COOLIFY_ENVIRONMENT_NAME;

  const db = await import("../lib/db.ts");
  const crypto = await import("../lib/crypto.ts");
  db.resetDbForTests();
  crypto.resetEncryptionKeyForTests();
  const settings = await import("../lib/settings.ts");

  assert.equal(settings.normalizeCoolifyToken('  Bearer "8|secret-part"  '), "8|secret-part");
  settings.updateCoolifyConnection({
    url: "https://coolify.example.com/",
    token: "Bearer 8|secret-part",
    project: "project-uuid",
    server: "server-uuid",
    environment: "production",
  });
  assert.equal(settings.coolifyConfig().url, "https://coolify.example.com");
  assert.equal(settings.coolifyToken(), "8|secret-part");
  assert.throws(
    () =>
      settings.updateCoolifyConnection({
        url: "https://coolify.example.com",
        token: "secret-only",
        project: "project-uuid",
        server: "server-uuid",
        environment: "production",
      }),
    /vertical bar/,
  );
  assert.equal(settings.coolifyToken(), "8|secret-part");

  process.env.COOLIFY_API_TOKEN = "9|from-env";
  assert.equal(settings.coolifyToken(), "9|from-env");
  assert.throws(
    () =>
      settings.updateCoolifyConnection({
        url: "https://coolify.example.com",
        token: "10|other",
        project: "project-uuid",
        server: "server-uuid",
        environment: "production",
      }),
    /COOLIFY_API_TOKEN/,
  );
  delete process.env.COOLIFY_API_TOKEN;
});

test("a replaced environment key does not make saved secrets unreadable", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "csm-key-"));
  process.env.PANEL_DB_PATH = path.join(dir, "panel.db");
  process.env.PANEL_ENCRYPTION_KEY = Buffer.alloc(32, 3).toString("base64");
  const crypto = await import("../lib/crypto.ts");
  crypto.resetEncryptionKeyForTests();
  const packed = crypto.encryptJson("panel-secret");
  process.env.PANEL_ENCRYPTION_KEY = Buffer.alloc(32, 4).toString("base64");
  crypto.resetEncryptionKeyForTests();
  assert.equal(crypto.decryptJson(packed.ciphertext, packed.nonce), "panel-secret");
  assert.equal(crypto.encryptionKeyDiffersFromEnv(), true);
  delete process.env.PANEL_ENCRYPTION_KEY;
  crypto.resetEncryptionKeyForTests();
});

test("a replaced panel database keeps setup and the Coolify service", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "csm-recall-"));
  process.env.PANEL_DB_PATH = path.join(dir, "panel.db");
  process.env.PANEL_ENCRYPTION_KEY = Buffer.alloc(32, 5).toString("base64");
  process.env.APEX_DOMAIN = "carsgames.org";
  process.env.COOLIFY_API_URL = "https://coolify.example.com";
  process.env.COOLIFY_API_TOKEN = "4|secret";
  process.env.COOLIFY_PROJECT_UUID = "project";
  process.env.COOLIFY_SERVER_UUID = "server";
  delete process.env.COOLIFY_ENVIRONMENT_NAME;

  const db = await import("../lib/db.ts");
  const crypto = await import("../lib/crypto.ts");
  db.resetDbForTests();
  crypto.resetEncryptionKeyForTests();
  const settings = await import("../lib/settings.ts");
  const projects = await import("../lib/projects.ts");
  const compose = await import("../lib/compose.ts");

  assert.equal(settings.isInstalled(), true);
  assert.equal(settings.getSetting("installed"), "1");
  settings.setSetting("installed", "0");
  delete process.env.APEX_DOMAIN;
  assert.equal(settings.envCompletesInstall(), true);
  assert.equal(settings.isInstalled(), true);
  assert.equal(settings.coolifyConfig().project, "project");

  const recovered = projects.rememberRunningService({
    slug: "demo",
    uuid: "service-uuid",
    apiHost: "demo.carsgames.org",
    studioHost: "demo-studio.carsgames.org",
    envValues: {},
  });
  assert.equal(recovered?.status, "running");
  assert.equal(recovered?.keysLocal, false);
  assert.equal(recovered?.coolifyServiceUuid, "service-uuid");
  projects.requestProvision(recovered!.id);
  assert.equal(projects.getProject(recovered!.id)?.status, "queued");
  assert.throws(() => projects.exportProjectArchive(recovered!.id), /offline file/);
  projects.updateProjectAddresses(recovered!.id, {
    scheme: "http",
    customDomain: "demo.carsgames.org",
    panelHost: "demo-studio.carsgames.org",
  });
  assert.equal(projects.getProject(recovered!.id)?.scheme, "http");

  const secrets = generateStackSecrets();
  const restored = projects.restoreProject({
    format: "covixy-supa-offline",
    version: 1,
    exportedAt: new Date().toISOString(),
    name: "Demo",
    slug: "demo",
    postgresMajor: 17,
    scheme: "https",
    customDomain: null,
    panelHost: null,
    env: compose.stackEnv({
      name: "Demo",
      slug: "demo",
      apiUrl: "https://demo.carsgames.org",
      secrets,
    }),
  });
  assert.equal(restored.id, recovered?.id);
  assert.equal(restored.keysLocal, true);
  assert.equal(restored.status, "queued");
  assert.equal(restored.coolifyServiceUuid, "service-uuid");
  assert.equal(projects.revealSecret(restored.id, "serviceRole"), secrets.serviceRoleKey);

  delete process.env.COOLIFY_API_URL;
  delete process.env.COOLIFY_API_TOKEN;
  delete process.env.COOLIFY_PROJECT_UUID;
  delete process.env.COOLIFY_SERVER_UUID;
});
