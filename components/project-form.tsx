"use client";

import { useActionState, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Server } from "lucide-react";
import { createProjectAction, type ActionState } from "@/app/actions";
import { AddressEditor } from "@/components/address-editor";
import { Stepper } from "@/components/stepper";
import { hostsFor, slugify } from "@/lib/hosts";
import { normalizeHost, validateHost } from "@/lib/urls";

const steps = ["Details", "Hosts", "Capacity", "Create"];

export function ProjectForm({
  apex,
  canCreate,
  freeMb,
  stackRamMb,
  serverRamMb,
  usedMb,
  reserveMb,
}: {
  apex: string;
  canCreate: boolean;
  freeMb: number;
  stackRamMb: number;
  serverRamMb: number;
  usedMb: number;
  reserveMb: number;
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(createProjectAction, null);
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [touched, setTouched] = useState(false);
  const [hostError, setHostError] = useState<string | null>(null);
  const [reviewHosts, setReviewHosts] = useState<{ api: string; panel: string } | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const hosts = slug.length >= 2 ? hostsFor(slug, apex) : null;
  const slugReady = /^[a-z][a-z0-9-]{1,31}$/.test(slug) && !slug.endsWith("-");

  function continueStep() {
    if (step === 1 && hosts && formRef.current) {
      const data = new FormData(formRef.current);
      const custom = normalizeHost(String(data.get("customDomain") ?? ""));
      const panel = normalizeHost(String(data.get("panelHost") ?? ""));
      if (custom) {
        const domainError = validateHost(custom);
        if (domainError) {
          setHostError(`Custom domain: ${domainError}`);
          return;
        }
      }
      const panelError = validateHost(panel);
      if (panelError) {
        setHostError(`Panel URL: ${panelError}`);
        return;
      }
      if (custom && custom === panel) {
        setHostError("The API host and the panel host have to be different.");
        return;
      }
      setHostError(null);
      setReviewHosts({ api: custom || hosts.apiHost, panel });
    }
    setStep((value) => value + 1);
  }

  return (
    <form
      ref={formRef}
      action={action}
      className="card max-w-2xl p-6"
      onSubmit={(event) => {
        if (step < 3) {
          event.preventDefault();
          if (name.trim() && slugReady) setStep((value) => value + 1);
        }
      }}
    >
      <input type="hidden" name="name" value={name} />
      <input type="hidden" name="slug" value={slug} />
      <Stepper steps={steps} current={step} />
      <div className="mt-8">
        {step === 0 ? (
          <div className="space-y-5">
            <label className="block">
              <span className="text-sm font-medium">Project name</span>
              <input
                required
                value={name}
                onChange={(event) => {
                  const next = event.target.value;
                  setName(next);
                  if (!touched) setSlug(slugify(next));
                }}
                className="mt-2 w-full px-3 py-3"
                placeholder="Acme"
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium">Slug</span>
              <input
                required
                value={slug}
                onChange={(event) => {
                  setTouched(true);
                  setSlug(event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 32));
                }}
                className="mt-2 w-full px-3 py-3 font-mono text-sm"
                placeholder="acme"
              />
            </label>
          </div>
        ) : null}

        {hosts ? (
          <div className={step === 1 ? "" : "hidden"}>
            <AddressEditor
              slug={slug}
              apex={apex}
              scheme="https"
              customDomain=""
              panelHost={hosts.studioHost}
              apiHost={hosts.apiHost}
              studioHost={hosts.studioHost}
            />
          </div>
        ) : null}

        {step === 2 ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              <div className="bg-bg rounded-lg p-3">
                <p className="text-muted">Server</p>
                <p className="text-lg font-semibold">{serverRamMb} MB</p>
              </div>
              <div className="bg-bg rounded-lg p-3">
                <p className="text-muted">Reserved</p>
                <p className="text-lg font-semibold">{reserveMb} MB</p>
              </div>
              <div className="bg-bg rounded-lg p-3">
                <p className="text-muted">In use</p>
                <p className="text-lg font-semibold">{usedMb} MB</p>
              </div>
              <div className="bg-bg rounded-lg p-3">
                <p className="text-muted">This stack</p>
                <p className="text-lg font-semibold">{stackRamMb} MB</p>
              </div>
            </div>
            <p className="text-muted text-sm">The reserve follows the Coolify server's RAM and CPU, so the OS, Docker, and proxy stay out of the project load.</p>
            {canCreate ? (
              <p className="text-sm">{freeMb} MB free after that reserve. This project fits.</p>
            ) : (
              <p className="text-warn text-sm">
                {freeMb} MB free. Pause or delete a stack before adding one that needs {stackRamMb} MB.
              </p>
            )}
          </div>
        ) : null}

        {step === 3 && hosts ? (
          <div className="space-y-3 text-sm">
            <p>
              <span className="text-muted">Name. </span>
              {name}
            </p>
            <p>
              <span className="text-muted">API. </span>
              <span className="font-mono">{reviewHosts?.api || hosts.apiHost}</span>
            </p>
            <p>
              <span className="text-muted">Panel. </span>
              <span className="font-mono">{reviewHosts?.panel || hosts.studioHost}</span>
            </p>
            <p className="text-muted">
              Keys are generated when you create the project. Email confirmation starts off until SMTP is set.
            </p>
          </div>
        ) : null}
      </div>

      {hostError ? <p className="text-danger mt-4 text-sm">{hostError}</p> : null}
      {state?.error ? <p className="text-danger mt-4 text-sm">{state.error}</p> : null}

      <div className="mt-8 flex items-center justify-between">
        <button type="button" className="btn btn-ghost" onClick={() => setStep((value) => Math.max(0, value - 1))} disabled={step === 0 || pending}>
          <ArrowLeft size={16} />
          Back
        </button>
        {step < 3 ? (
          <button
            type="button"
            className="btn btn-primary"
            disabled={(step === 0 && (!name.trim() || !slugReady)) || (step === 2 && !canCreate)}
            onClick={continueStep}
          >
            Continue
            <ArrowRight size={16} />
          </button>
        ) : (
          <button type="submit" className="btn btn-primary" disabled={pending || !canCreate}>
            <Server size={16} />
            {pending ? "Creating…" : "Create project"}
          </button>
        )}
      </div>
    </form>
  );
}
