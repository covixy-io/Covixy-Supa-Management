"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Globe } from "lucide-react";
import { updateAddressesAction } from "@/app/actions";
import { CopyButton } from "@/components/copy-button";
import { describeAddresses, validateHost, type UrlScheme } from "@/lib/urls";

const schemes: { id: UrlScheme; label: string }[] = [
  { id: "https", label: "HTTPS" },
  { id: "http", label: "HTTP" },
  { id: "both", label: "HTTP and HTTPS" },
];

export function AddressEditor({
  projectId,
  slug,
  apex,
  scheme,
  customDomain,
  panelHost,
  apiHost,
  studioHost,
}: {
  projectId?: string;
  slug: string;
  apex: string;
  scheme: UrlScheme;
  customDomain: string;
  panelHost: string;
  apiHost: string;
  studioHost: string;
}) {
  const router = useRouter();
  const [choice, setChoice] = useState<UrlScheme>(scheme);
  const [domain, setDomain] = useState(customDomain);
  const [panel, setPanel] = useState(panelHost || studioHost);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [saved, setSaved] = useState(false);
  const typedDomain = domain.trim().toLowerCase();
  const typedPanel = panel.trim().toLowerCase();
  const preview = describeAddresses({
    apiHost,
    studioHost,
    scheme: choice,
    customDomain: typedDomain && typedDomain !== apiHost && !validateHost(typedDomain) ? typedDomain : null,
    panelHost: typedPanel && typedPanel !== studioHost && !validateHost(typedPanel) ? typedPanel : null,
  });

  return (
    <div className="card space-y-4 p-4">
      <div className="flex items-center gap-2">
        <Globe size={16} className="text-blue" />
        <h2 className="text-sm font-semibold">Addresses</h2>
      </div>
      <div className="flex flex-wrap gap-2">
        {schemes.map((item) => (
          <button
            key={item.id}
            type="button"
            className={choice === item.id ? "btn btn-primary" : "btn btn-ghost"}
            onClick={() => {
              setChoice(item.id);
              setSaved(false);
            }}
          >
            {item.label}
          </button>
        ))}
      </div>
      <label className="block text-sm">
        <span className="font-medium">Custom domain</span>
        <input
          value={domain}
          placeholder={`Optional, or keep ${apiHost}`}
          onChange={(event) => {
            setDomain(event.target.value);
            setSaved(false);
          }}
          className="mt-1.5 w-full px-3 py-2 font-mono text-sm"
        />
      </label>
      <label className="block text-sm">
        <span className="font-medium">Panel URL</span>
        <input
          value={panel}
          onChange={(event) => {
            setPanel(event.target.value);
            setSaved(false);
          }}
          className="mt-1.5 w-full px-3 py-2 font-mono text-sm"
        />
      </label>
      <div className="bg-bg space-y-2 rounded-xl p-3 text-sm">
        <UrlLine label="API" urls={preview.apiUrls} />
        <UrlLine label="Panel" urls={preview.panelUrls} />
        <p className="text-muted text-xs">
          {preview.customDomain
            ? `The API is published at ${preview.canonicalApiUrl}. Panel is Studio.`
            : `The API is published at ${apiHost}. Panel is Studio.`}
        </p>
      </div>
      {error ? <p className="text-danger text-sm">{error}</p> : null}
      {projectId ? null : (
        <>
          <input type="hidden" name="scheme" value={choice} />
          <input type="hidden" name="customDomain" value={domain} />
          <input type="hidden" name="panelHost" value={panel} />
        </>
      )}
      {projectId ? (
        <button
          type="button"
          className="btn btn-primary"
          disabled={pending}
          onClick={async () => {
            setPending(true);
            setError(null);
            setSaved(false);
            const result = await updateAddressesAction(projectId, {
              scheme: choice,
              customDomain: domain,
              panelHost: panel,
            });
            setPending(false);
            if (result.error) {
              setError(result.error);
              return;
            }
            setSaved(true);
            router.refresh();
          }}
        >
          {saved ? <Check size={16} /> : null}
          {pending ? "Saving…" : saved ? "Saved" : "Save addresses"}
        </button>
      ) : (
        <p className="text-muted text-xs">Slug {slug} on {apex}. These hosts are saved when you create the project.</p>
      )}
    </div>
  );
}

function UrlLine({ label, urls }: { label: string; urls: string[] }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div>
        <p className="text-muted text-xs font-medium">{label}</p>
        {urls.map((url) => (
          <p key={url} className="font-mono text-xs break-all">
            {url}
          </p>
        ))}
      </div>
      <CopyButton value={urls.join("\n")} label="Copy" />
    </div>
  );
}
