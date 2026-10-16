"use client";

import { useActionState, useState } from "react";
import { updateCoolifyAction, type ActionState } from "@/app/actions";

type Props = {
  url: string;
  project: string;
  server: string;
  environment: string;
  hasToken: boolean;
  locked: {
    url: boolean;
    token: boolean;
    project: boolean;
    server: boolean;
    environment: boolean;
  };
};

export function CoolifySettings({ url, project, server, environment, hasToken, locked }: Props) {
  const [state, action, pending] = useActionState<ActionState, FormData>(updateCoolifyAction, null);
  const [attempt, setAttempt] = useState(0);
  const [values, setValues] = useState({
    coolifyUrl: url,
    coolifyToken: "",
    coolifyProject: project,
    coolifyServer: server,
    coolifyEnvironment: environment || "production",
  });
  const saved = attempt > 0 && !pending && !state?.error;
  const blocked = locked.url && locked.token && locked.project && locked.server;

  function setValue(name: keyof typeof values, value: string) {
    setValues((current) => ({ ...current, [name]: value }));
  }

  return (
    <form
      action={action}
      className="card mt-3 space-y-4 p-4"
      onSubmit={() => setAttempt((value) => value + 1)}
    >
      <Field label="Coolify URL" name="coolifyUrl" value={values.coolifyUrl} onChange={(value) => setValue("coolifyUrl", value)} locked={locked.url} placeholder="https://coolify.example.com" />
      <Field
        label="API token"
        name="coolifyToken"
        value={values.coolifyToken}
        onChange={(value) => setValue("coolifyToken", value)}
        locked={locked.token}
        type="password"
        placeholder={hasToken ? "Leave blank to keep the saved token" : "4|secret"}
        hint={
          locked.token
            ? "COOLIFY_API_TOKEN is set where this panel runs. Edit that variable, keep the number, the vertical bar, and the secret, then redeploy."
            : "Paste the whole line from Coolify → Keys & Tokens. It looks like 4|secret."
        }
      />
      <Field label="Project UUID" name="coolifyProject" value={values.coolifyProject} onChange={(value) => setValue("coolifyProject", value)} locked={locked.project} />
      <Field label="Server UUID" name="coolifyServer" value={values.coolifyServer} onChange={(value) => setValue("coolifyServer", value)} locked={locked.server} />
      <Field label="Environment" name="coolifyEnvironment" value={values.coolifyEnvironment} onChange={(value) => setValue("coolifyEnvironment", value)} locked={locked.environment} />
      {blocked ? (
        <p className="text-muted text-sm">
          These values come from environment variables. Change them where the panel is deployed, then redeploy.
        </p>
      ) : null}
      {state?.error ? <p className="text-danger text-sm">{state.error}</p> : null}
      {saved ? <p className="text-sm font-medium text-blue">Saved. Click Check Coolify.</p> : null}
      <button type="submit" className="btn btn-primary" disabled={pending || blocked}>
        {pending ? "Saving…" : "Save connection"}
      </button>
    </form>
  );
}

function Field({
  label,
  name,
  value,
  onChange,
  locked,
  type = "text",
  placeholder,
  hint,
}: {
  label: string;
  name: string;
  value: string;
  onChange: (value: string) => void;
  locked: boolean;
  type?: string;
  placeholder?: string;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="flex items-center justify-between gap-4 text-sm font-medium">
        {label}
        {locked ? <span className="text-muted text-xs font-normal">From environment</span> : null}
      </span>
      <input
        name={name}
        type={type}
        value={locked ? "" : value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={locked ? "Set in the environment" : placeholder}
        disabled={locked}
        autoComplete="off"
        className="mt-1.5 w-full px-3 py-2.5 disabled:opacity-60"
      />
      {hint ? <span className="text-muted mt-1.5 block text-xs">{hint}</span> : null}
    </label>
  );
}
