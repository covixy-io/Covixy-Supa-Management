import { headers } from "next/headers";
import Link from "next/link";
import { Activity, BookOpen, Boxes, Gauge, LogOut, Settings } from "lucide-react";
import { logoutAction } from "@/app/actions";
import { ThemeToggle } from "@/components/theme-toggle";
import { passwordEnabled } from "@/lib/auth";
import { coolifyMode } from "@/lib/coolify";

const links = [
  { href: "/", label: "Guide", icon: BookOpen },
  { href: "/projects", label: "Projects", icon: Boxes },
  { href: "/capacity", label: "Analytics", icon: Gauge },
  { href: "/activity", label: "Activity", icon: Activity },
  { href: "/settings", label: "Settings", icon: Settings },
];

function selected(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  if (href === "/projects") return pathname === "/projects" || pathname.startsWith("/projects/");
  return pathname === href || pathname.startsWith(`${href}/`);
}

export async function Shell({ children }: { children: React.ReactNode }) {
  const pathname = (await headers()).get("x-pathname") || "";
  const mode = coolifyMode();
  const locked = passwordEnabled();

  return (
    <div className="md:flex md:min-h-screen">
      <aside className="border-line bg-surface flex w-full flex-col gap-5 border-b px-4 py-4 md:sticky md:top-0 md:h-screen md:w-64 md:shrink-0 md:border-r md:border-b-0 md:px-4 md:py-5 md:pb-16">
        <div className="flex items-center justify-between gap-3 px-1">
          <Link href="/projects" className="flex items-center gap-3">
            <span className="bg-blue grid h-10 w-10 place-items-center rounded-2xl text-lg font-bold text-white">S</span>
            <span>
              <span className="text-muted block text-[11px] font-semibold tracking-wide">COVIXY</span>
              <span className="block text-lg leading-tight font-bold">Supa</span>
            </span>
          </Link>
          <ThemeToggle />
        </div>
        <nav className="flex flex-wrap gap-1 md:flex-col">
          {links.map((link) => {
            const Icon = link.icon;
            const on = selected(pathname, link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium ${
                  on ? "bg-blue text-white" : "text-ink hover:bg-blue-soft"
                }`}
              >
                <Icon size={16} />
                {link.label}
              </Link>
            );
          })}
        </nav>
        <div className="bg-bg mt-auto hidden rounded-2xl p-3 md:block">
          <p className="text-muted text-[11px] font-semibold tracking-wide">CONNECTION</p>
          <p className={`mt-1 text-sm font-semibold ${mode === "live" ? "text-blue" : "text-warn"}`}>
            {mode === "live" ? "Coolify live" : "Rehearsal"}
          </p>
          {locked ? (
            <form action={logoutAction} className="mt-3">
              <button type="submit" className="btn btn-ghost w-full">
                <LogOut size={16} />
                Log out
              </button>
            </form>
          ) : (
            <p className="text-muted mt-2 text-xs">No panel password on this machine.</p>
          )}
        </div>
      </aside>
      <div className="min-w-0 flex-1 px-4 py-6 md:px-8 md:py-8">
        <div className="mx-auto w-full max-w-6xl">{children}</div>
      </div>
    </div>
  );
}
