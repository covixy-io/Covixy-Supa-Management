# Covixy Supa Management

Free control panel for one self-hosted Supabase stack per project, deployed through Coolify.

Use it, change it, and ship it in commercial products under the [MIT License](LICENSE). Keep the copyright and permission notice. There is no warranty.

This project is not affiliated with, endorsed by, or maintained by Supabase Inc. Supabase is a trademark of Supabase Inc.

## What you get

- One stack per project: create, pause, resume, and delete
- Generated keys, encrypted at rest, hidden until you reveal them
- HTTP, HTTPS, or both, plus an optional custom API domain and panel hostname
- Capacity from the Coolify server specs, with a reserve for the machine
- An offline JSON copy you can restore later

The offline file keeps the project definition, keys, and environment. It does not include Postgres table data.

## Requirements

- Node.js 20.9 or newer
- A DNS zone if you publish real hostnames
- Coolify, when you leave rehearsal and deploy for real

## Start

```bash
npm install
npm test
npm run dev
```

Copy `.env.example` to `.env.local`, then open http://localhost:3000.

The guide is the front page. The panel is at `/projects`. The first run is a one-time setup.

Without Coolify credentials the panel stays in rehearsal. It still generates secrets and walks the same jobs, and it does not call Coolify.

## Live Coolify

Set these before the panel can reach a server:

```bash
COOLIFY_API_URL=
COOLIFY_API_TOKEN=
COOLIFY_PROJECT_UUID=
COOLIFY_SERVER_UUID=
APEX_DOMAIN=example.com
PANEL_PASSWORD=
PANEL_SESSION_SECRET=
PANEL_ENCRYPTION_KEY=
```

`PANEL_ENCRYPTION_KEY` is 32 bytes of base64. Generate one with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

RAM and the reserve come from Coolify `server_metadata`. `SERVER_RAM_MB` and `SERVER_RESERVE_MB` override that when set.

Default hosts are `{slug}.$APEX_DOMAIN` and `{slug}-studio.$APEX_DOMAIN`. A custom domain becomes the API address, and the slug host stays as an alias. The panel URL is the Studio hostname. HTTPS is canonical unless you choose HTTP only. Choosing both keeps HTTPS as the published API URL and adds the other scheme to the redirect list.

## Deploy on Coolify

Docker Compose Empty does not clone Git, so build the image on your machine and push it before you paste `docker-compose.yml`. Replace `YOUR_DOCKERHUB_USER` in that file. The `panel-data` volume is already declared, and Coolify fills the session secret and encryption key.

## Before you expose it

Set a panel password, a session secret, and an encryption key before anything but your own machine can open the panel. An empty password is for a local rehearsal only.

Do not commit `.env`, `.env.local`, or `data/`. Publish only the API and Studio hostnames you chose. Keep Postgres on the private network.

## Supabase guidelines

- Use the name Supabase only to say which software this panel deploys.
- Do not use the Supabase logo or wordmark. This panel has its own mark.
- Do not present Covixy Supa Management as an official Supabase product.
- The Supabase services keep their own licenses, most of them Apache License 2.0. Those notices stay with the images and compose files. The MIT license here covers this panel only.
- Self-hosted Supabase is community-supported. Branching, point-in-time recovery, and the platform Management API are part of the managed service.
- The Supabase CLI local stack is for development. Do not expose it on the public internet.
- Generate your own secrets. Never start from the sample passwords in a Supabase env file.

Guides from Supabase: [self-hosting](https://supabase.com/docs/guides/self-hosting) and [brand assets](https://supabase.com/brand-assets).
