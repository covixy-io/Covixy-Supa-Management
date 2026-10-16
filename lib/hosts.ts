const RESERVED = new Set(["www", "panel", "api", "studio", "coolify", "mail", "cdn", "status", "app"]);

export function apexDomain(): string {
  return (process.env.APEX_DOMAIN || "covixy.com").trim().toLowerCase();
}

export function slugify(name: string): string {
  const slug = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32)
    .replace(/-+$/g, "");
  if (!slug) return "";
  return /^[a-z]/.test(slug) ? slug : `p-${slug}`.slice(0, 32);
}

export function validateSlug(slug: string): string | null {
  if (!/^[a-z][a-z0-9-]{1,31}$/.test(slug) || slug.endsWith("-")) {
    return "Use 2–32 characters: a letter, then letters, numbers, or hyphens.";
  }
  if (RESERVED.has(slug)) return "That slug is reserved.";
  return null;
}

export function validateApex(apex: string): string | null {
  if (!/^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/.test(apex)) {
    return "Set APEX_DOMAIN to a zone like covixy.com, without a scheme or wildcard.";
  }
  return null;
}

export function hostsFor(slug: string, apex: string): { apiHost: string; studioHost: string } {
  return {
    apiHost: `${slug}.${apex}`,
    studioHost: `${slug}-studio.${apex}`,
  };
}

export function singleLabelHosts(slug: string, apex: string): boolean {
  const { apiHost, studioHost } = hostsFor(slug, apex);
  const apexLabels = apex.split(".").length;
  return [apiHost, studioHost].every((host) => host.split(".").length === apexLabels + 1);
}
