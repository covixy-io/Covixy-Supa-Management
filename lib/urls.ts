import type { EnvVar } from "@/lib/compose";
import { hostsFor } from "@/lib/hosts";

export type UrlScheme = "http" | "https" | "both";

export type AddressInput = {
  apiHost: string;
  studioHost: string;
  scheme: UrlScheme;
  customDomain: string | null;
  panelHost: string | null;
};

export type AddressSet = AddressInput & {
  publicApiHost: string;
  effectivePanelHost: string;
  canonicalApiUrl: string;
  canonicalPanelUrl: string;
  apiUrls: string[];
  panelUrls: string[];
  redirectUrls: string[];
  coolifyUrls: { name: string; url: string }[];
};

export function parseScheme(value: string): UrlScheme {
  if (value === "http" || value === "https" || value === "both") return value;
  return "https";
}

export function normalizeHost(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .split("/")[0]
    .replace(/:\d+$/, "");
}

export function validateHost(host: string): string | null {
  if (!host) return "Enter a hostname.";
  if (host.length > 253 || host.includes("..")) return "That hostname is too long.";
  if (!/^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/.test(host)) {
    return "Use a hostname like panel.example.com, without a scheme, port, or path.";
  }
  return null;
}

export function urlsForHost(host: string, scheme: UrlScheme): string[] {
  if (scheme === "http") return [`http://${host}`];
  if (scheme === "both") return [`https://${host}`, `http://${host}`];
  return [`https://${host}`];
}

export function canonicalUrl(host: string, scheme: UrlScheme): string {
  return `${scheme === "http" ? "http" : "https"}://${host}`;
}

export function describeAddresses(input: AddressInput): AddressSet {
  const publicApiHost = input.customDomain || input.apiHost;
  const effectivePanelHost = input.panelHost || input.studioHost;
  const apiUrls = [...new Set([...urlsForHost(publicApiHost, input.scheme), ...urlsForHost(input.apiHost, input.scheme)])];
  const panelUrls = urlsForHost(effectivePanelHost, input.scheme);
  const canonicalApiUrl = canonicalUrl(publicApiHost, input.scheme);
  const coolifyUrls = [
    { name: "gateway", url: apiUrls.join(",") },
    { name: "studio", url: panelUrls.join(",") },
  ];
  return {
    ...input,
    publicApiHost,
    effectivePanelHost,
    canonicalApiUrl,
    canonicalPanelUrl: canonicalUrl(effectivePanelHost, input.scheme),
    apiUrls,
    panelUrls,
    redirectUrls: apiUrls.filter((url) => url !== canonicalApiUrl),
    coolifyUrls,
  };
}

export function resolveAddressInput(input: {
  slug: string;
  apex: string;
  scheme: string;
  customDomain: string;
  panelHost: string;
}): { error: string | null; addresses: AddressSet } {
  const hosts = hostsFor(input.slug, input.apex);
  const scheme = parseScheme(input.scheme);
  const customDomain = normalizeHost(input.customDomain);
  const panelHost = normalizeHost(input.panelHost);
  if (customDomain) {
    const error = validateHost(customDomain);
    if (error) return { error: `Custom domain: ${error}`, addresses: describeAddresses({ ...hosts, scheme, customDomain: null, panelHost: null }) };
  }
  if (panelHost) {
    const error = validateHost(panelHost);
    if (error) return { error: `Panel URL: ${error}`, addresses: describeAddresses({ ...hosts, scheme, customDomain: null, panelHost: null }) };
  }
  const custom = customDomain && customDomain !== hosts.apiHost ? customDomain : null;
  const panel = panelHost && panelHost !== hosts.studioHost ? panelHost : null;
  const addresses = describeAddresses({ ...hosts, scheme, customDomain: custom, panelHost: panel });
  if (addresses.publicApiHost === addresses.effectivePanelHost) {
    return { error: "The panel URL has to be a different host from the API.", addresses };
  }
  return { error: null, addresses };
}

export function applyAddressEnv(env: Record<string, EnvVar>, addresses: AddressSet): Record<string, EnvVar> {
  const next = { ...env };
  const set = (key: string, value: string) => {
    next[key] = { value, secret: false };
  };
  set("API_EXTERNAL_URL", addresses.canonicalApiUrl);
  set("SUPABASE_PUBLIC_URL", addresses.canonicalApiUrl);
  set("SITE_URL", addresses.canonicalApiUrl);
  set("ADDITIONAL_REDIRECT_URLS", addresses.redirectUrls.join(","));
  set("SMTP_ADMIN_EMAIL", `noreply@${addresses.publicApiHost}`);
  return next;
}
