"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

export function JobLog({ type, status, log }: { type: string; status: string; log: string }) {
  const [open, setOpen] = useState(false);
  const [follow, setFollow] = useState(true);
  const scroller = useRef<HTMLDivElement>(null);
  const text = log || "Waiting for the worker.";

  useEffect(() => {
    if (!open || !follow || !scroller.current) return;
    scroller.current.scrollTop = scroller.current.scrollHeight;
  }, [open, follow, text]);

  return (
    <>
    <div className={open ? "h-80" : "h-14"} />
    <div className="border-line bg-surface fixed right-0 bottom-0 left-0 z-30 border-t md:left-64">
      <div className="mx-auto flex w-full max-w-6xl items-center gap-3 px-4 py-2 md:px-8">
        <button type="button" className="btn btn-text" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
          {open ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
          Latest job · {type} · {status}
        </button>
        {open ? (
          <label className="text-muted ml-auto flex items-center gap-2 text-sm">
            <input type="checkbox" checked={follow} onChange={(event) => setFollow(event.target.checked)} />
            Follow
          </label>
        ) : null}
      </div>
      {open ? (
        <div ref={scroller} className="log-scroll border-line mx-auto w-full max-w-6xl border-t px-4 py-3 md:px-8">
          <pre className="font-mono text-sm leading-6 whitespace-pre-wrap">
            {text.split("\n").map((line, index) => (
              <span key={`${index}-${line.slice(0, 24)}`} className={`block ${tone(line)}`}>
                {line || " "}
              </span>
            ))}
          </pre>
        </div>
      ) : null}
    </div>
    </>
  );
}

function tone(line: string): string {
  if (/error|failed|unhealthy|fatal|exception/i.test(line)) return "text-danger";
  if (/warn|waiting|starting/i.test(line)) return "text-warn";
  return "text-ink";
}
