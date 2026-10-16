const busy = new Set(["queued", "provisioning", "starting", "pausing", "resuming", "deleting"]);

export function isBusy(status: string): boolean {
  return busy.has(status);
}

export function StatusLamp({ status }: { status: string }) {
  const tone =
    status === "running" ? "bg-blue" : status === "failed" ? "bg-danger" : status === "paused" ? "bg-muted" : "bg-warn";
  return (
    <span className="inline-flex items-center gap-2 font-mono text-[11px] tracking-[0.14em] uppercase">
      <span className={`h-2 w-2 rounded-full ${tone} ${isBusy(status) ? "animate-pulse" : ""}`} />
      {status}
    </span>
  );
}

export function StatusDot({ status }: { status: string }) {
  const tone =
    status === "running"
      ? "bg-[#1f9d55]"
      : status === "failed"
        ? "bg-danger"
        : status === "paused"
          ? "bg-[#d4a017]"
          : "bg-warn";
  const label = status === "failed" ? "error" : status;
  return (
    <span className="inline-flex items-center gap-1.5 text-[13px] font-medium tracking-wide uppercase">
      <span className={`h-2 w-2 shrink-0 rounded-full ${tone} ${isBusy(status) ? "animate-pulse" : ""}`} />
      {label}
    </span>
  );
}
