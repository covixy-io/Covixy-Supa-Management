import { TEMPLATE } from "@/lib/template";

const ROLES_SQL = [
  "\\set pgpass `echo \"$POSTGRES_PASSWORD\"`",
  "",
  "ALTER USER authenticator WITH PASSWORD :'pgpass';",
  "ALTER USER pgbouncer WITH PASSWORD :'pgpass';",
  "ALTER USER supabase_auth_admin WITH PASSWORD :'pgpass';",
  "ALTER USER supabase_functions_admin WITH PASSWORD :'pgpass';",
  "ALTER USER supabase_storage_admin WITH PASSWORD :'pgpass';",
  "",
].join("\n");

const JWT_SQL = [
  "\\set jwt_exp `echo \"$JWT_EXP\"`",
  "",
  'ALTER DATABASE postgres SET "app.settings.jwt_exp" TO :\'jwt_exp\';',
  "",
].join("\n");

const SCHEMA_SQL = `
DO $$
BEGIN
  IF to_regclass('auth.users') IS NOT NULL THEN
    ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS banned_until timestamptz;
    ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
    ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS is_sso_user boolean NOT NULL DEFAULT false;
    ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS is_anonymous boolean NOT NULL DEFAULT false;
    GRANT USAGE ON SCHEMA auth TO supabase_auth_admin;
    GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA auth TO supabase_auth_admin;
    GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA auth TO supabase_auth_admin;
  END IF;
  IF to_regclass('storage.buckets') IS NOT NULL THEN
    GRANT USAGE ON SCHEMA storage TO supabase_storage_admin;
    GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA storage TO supabase_storage_admin;
    GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA storage TO supabase_storage_admin;
  END IF;
END $$;
`.trim();

function indent(text: string, spaces: number): string {
  const pad = " ".repeat(spaces);
  return text
    .split("\n")
    .map((line) => (line.length ? pad + line : line))
    .join("\n");
}

function dbBoot(rolesB64: string, jwtB64: string, schemaB64: string): string {
  return `mkdir -p /docker-entrypoint-initdb.d/init-scripts
echo '${rolesB64}' | base64 -d > /docker-entrypoint-initdb.d/init-scripts/99-roles.sql
echo '${jwtB64}' | base64 -d > /docker-entrypoint-initdb.d/init-scripts/99-jwt.sql
echo '${schemaB64}' | base64 -d > /tmp/99-schema.sql
docker-entrypoint.sh postgres -c config_file=/etc/postgresql/postgresql.conf -c log_min_messages=fatal &
child=$!
while kill -0 "$child" 2>/dev/null; do
  if test -f /tmp/roles-applied; then
    wait "$child"
    exit $?
  fi
  if pg_isready -U postgres -h localhost >/dev/null 2>&1 \\
    && psql -v ON_ERROR_STOP=1 -U postgres -d postgres -f /docker-entrypoint-initdb.d/init-scripts/99-roles.sql \\
    && psql -v ON_ERROR_STOP=1 -U postgres -d postgres -f /docker-entrypoint-initdb.d/init-scripts/99-jwt.sql \\
    && psql -v ON_ERROR_STOP=1 -U postgres -d postgres -f /tmp/99-schema.sql; then
    touch /tmp/roles-applied
  fi
  sleep 2
done
wait "$child"`;
}

function gatewayBoot(): string {
  return `cat > /etc/caddy/Caddyfile << 'EOF'
:80 {
	header {
		Access-Control-Allow-Origin *
		Access-Control-Allow-Headers *
		Access-Control-Allow-Methods "GET, POST, PUT, PATCH, DELETE, OPTIONS"
	}
	@preflight method OPTIONS
	handle @preflight {
		respond "" 204
	}
	handle_path /auth/v1/* {
		reverse_proxy auth:9999
	}
	handle_path /rest/v1/* {
		reverse_proxy rest:3000
	}
	handle_path /realtime/v1/* {
		rewrite * /socket{uri}
		reverse_proxy realtime:4000 {
			flush_interval -1
		}
	}
	handle_path /storage/v1/* {
		reverse_proxy storage:5000
	}
	handle /health {
		respond "ok" 200
	}
	respond "not found" 404
}
EOF
exec caddy run --config /etc/caddy/Caddyfile --adapter caddyfile`;
}

export function renderCompose(slug: string): string {
  const rolesB64 = Buffer.from(ROLES_SQL, "utf8").toString("base64");
  const jwtB64 = Buffer.from(JWT_SQL, "utf8").toString("base64");
  const schemaB64 = Buffer.from(SCHEMA_SQL, "utf8").toString("base64");

  return `# ${TEMPLATE.id} ${TEMPLATE.version}
# Postgres ${TEMPLATE.postgresMajor}. Image tags pinned from supabase/supabase on 2026-10-16.
# Functions, pooler, and analytics are omitted. The gateway is Caddy so the stack
# does not need the official Envoy config files checked out beside the compose file.
name: supa-${slug}

services:
  db:
    image: supabase/postgres:17.6.1.136
    restart: unless-stopped
    user: "0:0"
    entrypoint: ["/bin/sh", "-c"]
    command:
      - |
${indent(dbBoot(rolesB64, jwtB64, schemaB64), 8)}
    environment:
      POSTGRES_HOST: /var/run/postgresql
      PGPORT: \${POSTGRES_PORT}
      POSTGRES_PORT: \${POSTGRES_PORT}
      PGPASSWORD: \${POSTGRES_PASSWORD}
      POSTGRES_PASSWORD: \${POSTGRES_PASSWORD}
      PGDATABASE: \${POSTGRES_DB}
      POSTGRES_DB: \${POSTGRES_DB}
      JWT_EXP: \${JWT_EXP}
    volumes:
      - db:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "test -f /tmp/roles-applied && pg_isready -U postgres -h localhost"]
      interval: 5s
      timeout: 5s
      retries: 40
      start_period: 180s

  auth:
    image: supabase/gotrue:v2.197.0
    restart: unless-stopped
    depends_on:
      db:
        condition: service_healthy
    environment:
      GOTRUE_API_HOST: 0.0.0.0
      GOTRUE_API_PORT: 9999
      API_EXTERNAL_URL: \${API_EXTERNAL_URL}
      GOTRUE_DB_DRIVER: postgres
      GOTRUE_DB_DATABASE_URL: postgres://supabase_auth_admin:\${POSTGRES_PASSWORD}@\${POSTGRES_HOST}:\${POSTGRES_PORT}/\${POSTGRES_DB}
      GOTRUE_SITE_URL: \${SITE_URL}
      GOTRUE_URI_ALLOW_LIST: \${ADDITIONAL_REDIRECT_URLS}
      GOTRUE_DISABLE_SIGNUP: \${DISABLE_SIGNUP}
      GOTRUE_JWT_ADMIN_ROLES: service_role
      GOTRUE_JWT_AUD: authenticated
      GOTRUE_JWT_DEFAULT_GROUP_NAME: authenticated
      GOTRUE_JWT_EXP: \${JWT_EXPIRY}
      GOTRUE_JWT_SECRET: \${JWT_SECRET}
      GOTRUE_JWT_ISSUER: \${API_EXTERNAL_URL}
      GOTRUE_EXTERNAL_EMAIL_ENABLED: \${ENABLE_EMAIL_SIGNUP}
      GOTRUE_EXTERNAL_ANONYMOUS_USERS_ENABLED: \${ENABLE_ANONYMOUS_USERS}
      GOTRUE_MAILER_AUTOCONFIRM: \${ENABLE_EMAIL_AUTOCONFIRM}
      GOTRUE_SMTP_ADMIN_EMAIL: \${SMTP_ADMIN_EMAIL}
      GOTRUE_SMTP_HOST: \${SMTP_HOST}
      GOTRUE_SMTP_PORT: \${SMTP_PORT}
      GOTRUE_SMTP_USER: \${SMTP_USER}
      GOTRUE_SMTP_PASS: \${SMTP_PASS}
      GOTRUE_SMTP_SENDER_NAME: \${SMTP_SENDER_NAME}
      GOTRUE_MAILER_URLPATHS_INVITE: \${MAILER_URLPATHS_INVITE}
      GOTRUE_MAILER_URLPATHS_CONFIRMATION: \${MAILER_URLPATHS_CONFIRMATION}
      GOTRUE_MAILER_URLPATHS_RECOVERY: \${MAILER_URLPATHS_RECOVERY}
      GOTRUE_MAILER_URLPATHS_EMAIL_CHANGE: \${MAILER_URLPATHS_EMAIL_CHANGE}
      GOTRUE_EXTERNAL_PHONE_ENABLED: \${ENABLE_PHONE_SIGNUP}
      GOTRUE_SMS_AUTOCONFIRM: \${ENABLE_PHONE_AUTOCONFIRM}
    healthcheck:
      test: ["CMD", "wget", "--no-verbose", "--tries=1", "--spider", "http://localhost:9999/health"]
      interval: 5s
      timeout: 5s
      retries: 12
      start_period: 10s

  rest:
    image: postgrest/postgrest:v14.18
    restart: unless-stopped
    depends_on:
      db:
        condition: service_healthy
    environment:
      PGRST_DB_URI: postgres://authenticator:\${POSTGRES_PASSWORD}@\${POSTGRES_HOST}:\${POSTGRES_PORT}/\${POSTGRES_DB}
      PGRST_DB_SCHEMAS: \${PGRST_DB_SCHEMAS}
      PGRST_DB_MAX_ROWS: \${PGRST_DB_MAX_ROWS}
      PGRST_DB_EXTRA_SEARCH_PATH: \${PGRST_DB_EXTRA_SEARCH_PATH}
      PGRST_DB_ANON_ROLE: anon
      PGRST_JWT_SECRET: \${JWT_SECRET}
      PGRST_DB_USE_LEGACY_GUCS: "false"
      PGRST_APP_SETTINGS_JWT_EXP: \${JWT_EXPIRY}
    command: ["postgrest"]
    healthcheck:
      test: ["CMD", "postgrest", "--ready"]
      interval: 5s
      timeout: 5s
      retries: 12

  realtime:
    image: supabase/realtime:v2.143.3
    restart: unless-stopped
    depends_on:
      db:
        condition: service_healthy
    environment:
      PORT: 4000
      DB_HOST: \${POSTGRES_HOST}
      DB_PORT: \${POSTGRES_PORT}
      DB_USER: supabase_admin
      DB_PASSWORD: \${POSTGRES_PASSWORD}
      DB_NAME: \${POSTGRES_DB}
      DB_AFTER_CONNECT_QUERY: "SET search_path TO _realtime"
      DB_ENC_KEY: \${REALTIME_DB_ENC_KEY}
      API_JWT_SECRET: \${JWT_SECRET}
      SECRET_KEY_BASE: \${SECRET_KEY_BASE}
      METRICS_JWT_SECRET: \${JWT_SECRET}
      ERL_AFLAGS: -proto_dist inet_tcp
      DNS_NODES: "''"
      RLIMIT_NOFILE: "10000"
      APP_NAME: realtime
      SEED_SELF_HOST: "true"
      RUN_JANITOR: "true"
      DISABLE_HEALTHCHECK_LOGGING: "true"

  imgproxy:
    image: darthsim/imgproxy:v3.31.4
    restart: unless-stopped
    volumes:
      - storage:/var/lib/storage
    environment:
      IMGPROXY_BIND: ":5001"
      IMGPROXY_LOCAL_FILESYSTEM_ROOT: /
      IMGPROXY_USE_ETAG: "true"
      IMGPROXY_AUTO_WEBP: \${IMGPROXY_AUTO_WEBP}
      IMGPROXY_MAX_SRC_RESOLUTION: 16.8

  storage:
    image: supabase/storage-api:v1.81.0
    restart: unless-stopped
    depends_on:
      db:
        condition: service_healthy
      rest:
        condition: service_started
      imgproxy:
        condition: service_started
    volumes:
      - storage:/var/lib/storage
    environment:
      ANON_KEY: \${ANON_KEY}
      SERVICE_KEY: \${SERVICE_ROLE_KEY}
      POSTGREST_URL: http://rest:3000
      AUTH_JWT_SECRET: \${JWT_SECRET}
      DATABASE_URL: postgres://supabase_storage_admin:\${POSTGRES_PASSWORD}@\${POSTGRES_HOST}:\${POSTGRES_PORT}/\${POSTGRES_DB}
      STORAGE_PUBLIC_URL: \${SUPABASE_PUBLIC_URL}
      REQUEST_ALLOW_X_FORWARDED_PATH: "true"
      FILE_SIZE_LIMIT: 52428800
      STORAGE_BACKEND: file
      GLOBAL_S3_BUCKET: \${GLOBAL_S3_BUCKET}
      FILE_STORAGE_BACKEND_PATH: /var/lib/storage
      TENANT_ID: \${STORAGE_TENANT_ID}
      REGION: \${REGION}
      ENABLE_IMAGE_TRANSFORMATION: "true"
      IMGPROXY_URL: http://imgproxy:5001
      S3_PROTOCOL_ACCESS_KEY_ID: \${S3_PROTOCOL_ACCESS_KEY_ID}
      S3_PROTOCOL_ACCESS_KEY_SECRET: \${S3_PROTOCOL_ACCESS_KEY_SECRET}
    healthcheck:
      test: ["CMD", "wget", "--no-verbose", "--tries=1", "--spider", "http://127.0.0.1:5000/status"]
      interval: 5s
      timeout: 5s
      retries: 12
      start_period: 10s

  meta:
    image: supabase/postgres-meta:v0.100.0
    restart: unless-stopped
    depends_on:
      db:
        condition: service_healthy
    environment:
      PG_META_PORT: 8080
      PG_META_DB_HOST: \${POSTGRES_HOST}
      PG_META_DB_PORT: \${POSTGRES_PORT}
      PG_META_DB_NAME: \${POSTGRES_DB}
      PG_META_DB_USER: postgres
      PG_META_DB_PASSWORD: \${POSTGRES_PASSWORD}
      CRYPTO_KEY: \${PG_META_CRYPTO_KEY}

  studio:
    image: supabase/studio:2026.10.12-sha-3699278
    restart: unless-stopped
    ports:
      - "3000"
    volumes:
      - snippets:/app/snippets
    depends_on:
      meta:
        condition: service_started
    environment:
      HOSTNAME: 0.0.0.0
      STUDIO_PG_META_URL: http://meta:8080
      POSTGRES_PORT: \${POSTGRES_PORT}
      POSTGRES_HOST: \${POSTGRES_HOST}
      POSTGRES_DB: \${POSTGRES_DB}
      POSTGRES_PASSWORD: \${POSTGRES_PASSWORD}
      POSTGRES_USER_READ_WRITE: postgres
      PG_META_CRYPTO_KEY: \${PG_META_CRYPTO_KEY}
      PGRST_DB_SCHEMAS: \${PGRST_DB_SCHEMAS}
      DEFAULT_ORGANIZATION_NAME: \${STUDIO_DEFAULT_ORGANIZATION}
      DEFAULT_PROJECT_NAME: \${STUDIO_DEFAULT_PROJECT}
      SUPABASE_URL: http://gateway:80
      SUPABASE_PUBLIC_URL: \${SUPABASE_PUBLIC_URL}
      SUPABASE_ANON_KEY: \${ANON_KEY}
      SUPABASE_SERVICE_KEY: \${SERVICE_ROLE_KEY}
      SUPABASE_PUBLISHABLE_KEY: \${ANON_KEY}
      SUPABASE_SECRET_KEY: \${SERVICE_ROLE_KEY}
      AUTH_JWT_SECRET: \${JWT_SECRET}
      SNIPPETS_MANAGEMENT_FOLDER: /app/snippets

  gateway:
    image: caddy:2.10-alpine
    restart: unless-stopped
    ports:
      - "80"
    depends_on:
      auth:
        condition: service_started
      rest:
        condition: service_started
      realtime:
        condition: service_started
      storage:
        condition: service_started
    entrypoint: ["/bin/sh", "-c"]
    command:
      - |
${indent(gatewayBoot(), 8)}

volumes:
  db:
  storage:
  snippets:
`;
}

export type EnvVar = { value: string; secret: boolean };

export function stackEnv(input: {
  name: string;
  slug: string;
  apiUrl: string;
  secrets: {
    jwtSecret: string;
    anonKey: string;
    serviceRoleKey: string;
    postgresPassword: string;
    secretKeyBase: string;
    pgMetaCryptoKey: string;
    realtimeDbEncKey: string;
    dashboardUsername: string;
    dashboardPassword: string;
    s3ProtocolAccessKeyId: string;
    s3ProtocolAccessKeySecret: string;
  };
}): Record<string, EnvVar> {
  const secret = (value: string): EnvVar => ({ value, secret: true });
  const plain = (value: string): EnvVar => ({ value, secret: false });
  const { secrets } = input;

  return {
    POSTGRES_PASSWORD: secret(secrets.postgresPassword),
    POSTGRES_HOST: plain("db"),
    POSTGRES_PORT: plain("5432"),
    POSTGRES_DB: plain("postgres"),
    JWT_SECRET: secret(secrets.jwtSecret),
    JWT_EXP: plain("3600"),
    JWT_EXPIRY: plain("3600"),
    ANON_KEY: secret(secrets.anonKey),
    SERVICE_ROLE_KEY: secret(secrets.serviceRoleKey),
    SECRET_KEY_BASE: secret(secrets.secretKeyBase),
    PG_META_CRYPTO_KEY: secret(secrets.pgMetaCryptoKey),
    REALTIME_DB_ENC_KEY: secret(secrets.realtimeDbEncKey),
    DASHBOARD_USERNAME: secret(secrets.dashboardUsername),
    DASHBOARD_PASSWORD: secret(secrets.dashboardPassword),
    S3_PROTOCOL_ACCESS_KEY_ID: secret(secrets.s3ProtocolAccessKeyId),
    S3_PROTOCOL_ACCESS_KEY_SECRET: secret(secrets.s3ProtocolAccessKeySecret),
    API_EXTERNAL_URL: plain(input.apiUrl),
    SUPABASE_PUBLIC_URL: plain(input.apiUrl),
    SITE_URL: plain(input.apiUrl),
    ADDITIONAL_REDIRECT_URLS: plain(""),
    DISABLE_SIGNUP: plain("false"),
    ENABLE_EMAIL_SIGNUP: plain("true"),
    ENABLE_EMAIL_AUTOCONFIRM: plain("true"),
    ENABLE_ANONYMOUS_USERS: plain("false"),
    ENABLE_PHONE_SIGNUP: plain("false"),
    ENABLE_PHONE_AUTOCONFIRM: plain("false"),
    SMTP_ADMIN_EMAIL: plain("noreply@" + input.apiUrl.replace(/^https?:\/\//, "")),
    SMTP_HOST: plain(""),
    SMTP_PORT: plain("587"),
    SMTP_USER: plain(""),
    SMTP_PASS: secret(""),
    SMTP_SENDER_NAME: plain(input.name),
    MAILER_URLPATHS_INVITE: plain("/auth/v1/verify"),
    MAILER_URLPATHS_CONFIRMATION: plain("/auth/v1/verify"),
    MAILER_URLPATHS_RECOVERY: plain("/auth/v1/verify"),
    MAILER_URLPATHS_EMAIL_CHANGE: plain("/auth/v1/verify"),
    PGRST_DB_SCHEMAS: plain("public,storage"),
    PGRST_DB_MAX_ROWS: plain("1000"),
    PGRST_DB_EXTRA_SEARCH_PATH: plain("public,extensions"),
    STUDIO_DEFAULT_ORGANIZATION: plain("Covixy"),
    STUDIO_DEFAULT_PROJECT: plain(input.name),
    GLOBAL_S3_BUCKET: plain("stub"),
    STORAGE_TENANT_ID: plain(input.slug),
    REGION: plain("local"),
    IMGPROXY_AUTO_WEBP: plain("true"),
  };
}

export function composePlaceholders(yaml: string): string[] {
  return [...yaml.matchAll(/\$\{([A-Z0-9_]+)\}/g)].map((match) => match[1]);
}
