import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Download, Globe, KeyRound, Scale, Server, Shield } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";

export const metadata: Metadata = {
  title: "Guide · Covixy Supa Management",
  description:
    "Free control panel for one self-hosted Supabase stack per project. MIT license, including commercial use.",
};

const chapters = [
  { href: "#start", label: "Start" },
  { href: "#coolify", label: "Coolify" },
  { href: "#projects", label: "Projects" },
  { href: "#offline", label: "Offline" },
  { href: "#security", label: "Security" },
  { href: "#license", label: "License" },
  { href: "#supabase", label: "Supabase" },
];

export default function GuidePage() {
  return (
    <div className="min-h-screen">
      <header className="border-line bg-surface/90 sticky top-0 z-20 border-b backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3">
          <a href="#top" className="flex items-center gap-3">
            <span className="bg-blue grid h-9 w-9 place-items-center rounded-2xl text-sm font-bold text-white">S</span>
            <span className="text-sm font-semibold">Covixy Supa</span>
          </a>
          <nav className="text-muted hidden items-center gap-4 text-sm md:flex">
            {chapters.map((item) => (
              <a key={item.href} href={item.href} className="hover:text-ink">
                {item.label}
              </a>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Link href="/projects" className="btn btn-primary">
              Open panel
              <ArrowRight size={16} />
            </Link>
          </div>
        </div>
      </header>

      <main id="top" className="mx-auto max-w-5xl px-4 py-10 md:py-16">
        <p className="text-blue text-xs font-semibold tracking-[0.16em]">FREE TO USE · MIT LICENSE</p>
        <h1 className="mt-3 max-w-3xl text-4xl leading-tight font-bold md:text-5xl">
          One self-hosted Supabase stack for every project.
        </h1>
        <p className="text-muted mt-4 max-w-2xl text-lg">
          Covixy Supa Management creates, configures, and watches a stack on Coolify. It is free, including for
          commercial work, and it is not an official Supabase product.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/projects" className="btn btn-primary">
            Open the panel
            <ArrowRight size={16} />
          </Link>
          <a href="#start" className="btn btn-ghost">
            Read the guide
          </a>
        </div>

        <div className="mt-10 grid gap-3 sm:grid-cols-3">
          <Fact title="Free" body="No fee to run it, change it, or ship it inside your own product." />
          <Fact title="Commercial use" body="The MIT license allows selling and using this panel in a business." />
          <Fact title="Your servers" body="Each project is a stack you host. Data stays on the machine you choose." />
        </div>

        <section id="start" className="mt-16 scroll-mt-24">
          <SectionTitle icon={Server} title="Start" />
          <p className="text-muted mt-3 max-w-3xl text-sm leading-6">
            You need Node.js 20.9 or newer. Coolify is optional until you want a real deploy. Without it, the panel
            stays in rehearsal: it still generates keys and walks the same jobs, and it does not call Coolify.
          </p>
          <ol className="mt-5 grid gap-3 md:grid-cols-2">
            <Step n="1" title="Install">
              <Code>{`npm install
copy .env.example .env.local
npm test
npm run dev`}</Code>
            </Step>
            <Step n="2" title="Open it">
              Visit http://localhost:3000. The first visit is a one-time setup: zone, server, access, and Coolify.
            </Step>
            <Step n="3" title="Lock it down">
              Set a panel password and a 32-byte <CodeInline>PANEL_ENCRYPTION_KEY</CodeInline> before this process can
              be reached from anywhere but your own machine.
            </Step>
            <Step n="4" title="Create a project">
              Name it, choose the hosts and scheme, then let the panel generate the keys and queue provisioning.
            </Step>
          </ol>
        </section>

        <section id="coolify" className="mt-16 scroll-mt-24">
          <SectionTitle icon={KeyRound} title="Connect Coolify" />
          <p className="text-muted mt-3 max-w-3xl text-sm leading-6">
            Live mode needs the API URL, token, project UUID, and server UUID. Put them in the environment or in
            setup. RAM and the reserved headroom come from the specs Coolify has collected.{" "}
            <CodeInline>SERVER_RAM_MB</CodeInline> and <CodeInline>SERVER_RESERVE_MB</CodeInline> override that when
            you set them.
          </p>
          <pre className="bg-bg mt-4 overflow-auto rounded-2xl p-4 font-mono text-xs leading-6">{`COOLIFY_API_URL=
COOLIFY_API_TOKEN=
COOLIFY_PROJECT_UUID=
COOLIFY_SERVER_UUID=
APEX_DOMAIN=example.com
PANEL_PASSWORD=
PANEL_SESSION_SECRET=
PANEL_ENCRYPTION_KEY=`}</pre>
        </section>

        <section id="projects" className="mt-16 scroll-mt-24">
          <SectionTitle icon={Globe} title="Projects, domains, and scheme" />
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <Fact title="Default hosts" body="{slug}.your-zone and {slug}-studio.your-zone. One label under the zone." />
            <Fact title="Custom domain" body="An optional hostname becomes the API address. The slug host stays as an alias." />
            <Fact
              title="Panel URL"
              body="Studio starts on the studio host. Change it to any other hostname you control."
            />
          </div>
          <p className="text-muted mt-4 max-w-3xl text-sm leading-6">
            Choose HTTPS, HTTP, or both. HTTPS is the address the API publishes. HTTP only publishes http. Both keeps
            https as the canonical URL and lists the other scheme, plus the alias host, as extra redirect URLs.
          </p>
        </section>

        <section id="offline" className="mt-16 scroll-mt-24">
          <SectionTitle icon={Download} title="Offline copy and restore" />
          <p className="text-muted mt-3 max-w-3xl text-sm leading-6">
            Download a JSON file before you delete a project. Restore recreates the name, slug, keys, environment,
            scheme, custom domain, and panel host, then queues provisioning again. The file does not include Postgres
            table data. Take a database backup separately if you need the rows.
          </p>
        </section>

        <section id="security" className="mt-16 scroll-mt-24">
          <SectionTitle icon={Shield} title="Before you expose it" />
          <ul className="mt-4 grid gap-3 md:grid-cols-2">
            <li className="card p-4 text-sm leading-6">Set a panel password. An empty password is only for a machine you alone can open.</li>
            <li className="card p-4 text-sm leading-6">Set <CodeInline>PANEL_SESSION_SECRET</CodeInline> and <CodeInline>PANEL_ENCRYPTION_KEY</CodeInline>. Do not commit <CodeInline>.env.local</CodeInline> or <CodeInline>data/</CodeInline>.</li>
            <li className="card p-4 text-sm leading-6">Secrets stay encrypted and out of the page until you reveal them or download an offline copy.</li>
            <li className="card p-4 text-sm leading-6">Publish only the API and Studio hostnames you chose. Keep Postgres on the private network.</li>
          </ul>
        </section>

        <section id="license" className="mt-16 scroll-mt-24">
          <SectionTitle icon={Scale} title="License" />
          <div className="card mt-4 p-5">
            <p className="text-sm leading-6">
              This panel is released under the MIT License. You can use, copy, modify, and sell it, including in
              commercial products, as long as you keep the copyright and permission notice. There is no warranty. The
              full text is in the <span className="font-mono text-xs">LICENSE</span> file.
            </p>
            <p className="text-muted mt-3 text-sm leading-6">
              The Supabase services this panel deploys stay under their own licenses, most of them Apache License 2.0.
              Those notices travel with the images and compose files. This MIT grant covers Covixy Supa Management, not
              those projects.
            </p>
          </div>
        </section>

        <section id="supabase" className="mt-16 scroll-mt-24">
          <SectionTitle icon={Shield} title="Supabase guidelines" />
          <div className="border-blue bg-blue-soft mt-4 rounded-2xl border p-5 text-sm leading-6">
            <p>
              Covixy Supa Management is an independent project. It is not affiliated with, endorsed by, or maintained
              by Supabase Inc.
            </p>
            <ul className="mt-4 space-y-3">
              <li>Supabase is a trademark of Supabase Inc. The name is used only to identify the software this panel deploys.</li>
              <li>Do not use the Supabase logo or wordmark. This panel uses its own mark.</li>
              <li>Do not present this panel as an official Supabase product, and do not put Supabase in a product name that could be mistaken for one.</li>
              <li>Self-hosted Supabase is community-supported. Branching, point-in-time recovery, and the platform Management API belong to the managed service, not to a stack you run yourself.</li>
              <li>The Supabase CLI local stack is for development. Do not put it on the public internet. Use a Docker stack behind Coolify for a deployment.</li>
              <li>Generate your own secrets. Never start from the example passwords in a Supabase env sample, and keep Postgres off the public network.</li>
            </ul>
            <p className="mt-4">
              <a className="text-blue font-medium" href="https://supabase.com/docs/guides/self-hosting">
                Supabase self-hosting guide
              </a>
              <span className="text-muted"> · </span>
              <a className="text-blue font-medium" href="https://supabase.com/brand-assets">
                Supabase brand assets
              </a>
            </p>
          </div>
        </section>
      </main>

      <footer className="border-line text-muted border-t px-4 py-8 text-center text-xs">
        Covixy Supa Management · MIT License · Not an official Supabase product
      </footer>
    </div>
  );
}

function Fact({ title, body }: { title: string; body: string }) {
  return (
    <div className="card p-4">
      <p className="text-sm font-semibold">{title}</p>
      <p className="text-muted mt-1 text-sm leading-6">{body}</p>
    </div>
  );
}

function SectionTitle({ icon: Icon, title }: { icon: typeof Server; title: string }) {
  return (
    <h2 className="flex items-center gap-2 text-2xl font-bold">
      <Icon size={20} className="text-blue" />
      {title}
    </h2>
  );
}

function Step({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
  return (
    <li className="card p-4">
      <p className="text-blue text-xs font-semibold">Step {n}</p>
      <p className="mt-1 font-semibold">{title}</p>
      <div className="text-muted mt-2 text-sm leading-6">{children}</div>
    </li>
  );
}

function Code({ children }: { children: string }) {
  return <pre className="bg-bg mt-2 overflow-auto rounded-xl p-3 font-mono text-xs leading-5">{children}</pre>;
}

function CodeInline({ children }: { children: string }) {
  return <span className="font-mono text-xs">{children}</span>;
}
