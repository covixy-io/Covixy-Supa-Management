"use client";

import { useActionState, useState } from "react";
import { ArrowLeft, ArrowRight, Check } from "lucide-react";
import { setupAction, type ActionState } from "@/app/actions";
import { Stepper } from "@/components/stepper";
import { ThemeToggle } from "@/components/theme-toggle";
import { reserveFromSpecs } from "@/lib/server-specs";

const steps = ["Server", "Access", "Coolify", "Finish"];

export function SetupWizard() {
  const [state, action, pending] = useActionState<ActionState, FormData>(setupAction, null);
  const [step, setStep] = useState(0);
  const [apex, setApex] = useState("covixy.com");
  const [serverName, setServerName] = useState("primary");
  const [ram, setRam] = useState("8192");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [coolifyUrl, setCoolifyUrl] = useState("");
  const [coolifyToken, setCoolifyToken] = useState("");
  const [coolifyProject, setCoolifyProject] = useState("");
  const [coolifyServer, setCoolifyServer] = useState("");
  const [coolifyEnvironment, setCoolifyEnvironment] = useState("production");
  const [localError, setLocalError] = useState<string | null>(null);

  function next() {
    setLocalError(null);
    if (step === 0) {
      if (!/^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/.test(apex.trim().toLowerCase())) {
        setLocalError("Use a zone like covixy.com.");
        return;
      }
      if (Number(ram) < 2048) {
        setLocalError("Enter at least 2048 MB. Coolify replaces this with the server's real RAM once it reports specs.");
        return;
      }
    }
    if (step === 1 && password !== confirm) {
      setLocalError("Those passwords do not match.");
      return;
    }
    if (step === 1 && password && password.length < 8) {
      setLocalError("Use at least 8 characters, or leave the password empty.");
      return;
    }
    setStep((value) => Math.min(steps.length - 1, value + 1));
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col px-5 py-8">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-muted text-xs font-semibold tracking-wide">COVIXY</p>
          <h1 className="text-3xl font-bold">Set up Supa</h1>
        </div>
        <ThemeToggle />
      </div>
      <p className="text-muted mt-2 text-sm">This runs once. Server RAM is refreshed from Coolify whenever that server reports its specs.</p>
      <form
        action={action}
        className="card mt-8 p-6"
        onSubmit={(event) => {
          if (step < 3) {
            event.preventDefault();
            next();
          }
        }}
      >
        <Stepper steps={steps} current={step} />
        <div className="mt-8 space-y-4">
          {step === 0 ? (
            <>
              <Field label="Apex domain" value={apex} onChange={setApex} name="apex" />
              <Field label="Server name" value={serverName} onChange={setServerName} name="serverName" />
              <Field label="Fallback RAM (MB)" value={ram} onChange={setRam} name="ram" />
              <p className="text-muted text-sm">
                This is only used until Coolify reports the server. The reserve is then {reserveFromSpecs(Number(ram) || 0, 0)} MB:
                20% of RAM, at least 1 GB, and at most half the machine. CPU count raises it once specs arrive.
              </p>
            </>
          ) : null}
          {step === 1 ? (
            <>
              <Field label="Panel password" value={password} onChange={setPassword} name="password" type="password" />
              <Field label="Confirm password" value={confirm} onChange={setConfirm} type="password" />
              <p className="text-muted text-sm">Leave both empty if this machine stays private. You cannot rerun this step.</p>
            </>
          ) : null}
          {step === 2 ? (
            <>
              <Field label="Coolify URL" value={coolifyUrl} onChange={setCoolifyUrl} name="coolifyUrl" placeholder="https://coolify.example.com" />
              <Field label="API token" value={coolifyToken} onChange={setCoolifyToken} name="coolifyToken" type="password" />
              <Field label="Project UUID" value={coolifyProject} onChange={setCoolifyProject} name="coolifyProject" />
              <Field label="Server UUID" value={coolifyServer} onChange={setCoolifyServer} name="coolifyServer" />
              <Field label="Environment" value={coolifyEnvironment} onChange={setCoolifyEnvironment} name="coolifyEnvironment" />
              <p className="text-muted text-sm">Leave these empty to stay in rehearsal until you are ready to deploy.</p>
            </>
          ) : null}
          {step === 3 ? (
            <div className="space-y-2 text-sm">
              <p><span className="text-muted">Zone. </span>{apex}</p>
              <p><span className="text-muted">Server. </span>{serverName}, {ram} MB fallback, reserve calculated from Coolify specs</p>
              <p><span className="text-muted">Password. </span>{password ? "Set" : "Not set"}</p>
              <p><span className="text-muted">Coolify. </span>{coolifyUrl ? "Will connect" : "Rehearsal"}</p>
              <input type="hidden" name="apex" value={apex} />
              <input type="hidden" name="serverName" value={serverName} />
              <input type="hidden" name="ram" value={ram} />
              <input type="hidden" name="password" value={password} />
              <input type="hidden" name="coolifyUrl" value={coolifyUrl} />
              <input type="hidden" name="coolifyToken" value={coolifyToken} />
              <input type="hidden" name="coolifyProject" value={coolifyProject} />
              <input type="hidden" name="coolifyServer" value={coolifyServer} />
              <input type="hidden" name="coolifyEnvironment" value={coolifyEnvironment} />
            </div>
          ) : null}
        </div>
        {localError ? <p className="text-danger mt-4 text-sm">{localError}</p> : null}
        {state?.error ? <p className="text-danger mt-4 text-sm">{state.error}</p> : null}
        <div className="mt-8 flex items-center justify-between">
          <button type="button" className="btn btn-ghost" disabled={step === 0 || pending} onClick={() => setStep((value) => value - 1)}>
            <ArrowLeft size={16} />
            Back
          </button>
          {step < 3 ? (
            <button type="button" className="btn btn-primary" onClick={next}>
              Continue
              <ArrowRight size={16} />
            </button>
          ) : (
            <button type="submit" className="btn btn-primary" disabled={pending}>
              <Check size={16} />
              {pending ? "Saving…" : "Finish setup"}
            </button>
          )}
        </div>
      </form>
    </main>
  );
}

function Field({
  label,
  value,
  onChange,
  name,
  type = "text",
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  name?: string;
  type?: string;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium">{label}</span>
      <input
        name={name}
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1.5 w-full px-3 py-2.5"
      />
    </label>
  );
}
