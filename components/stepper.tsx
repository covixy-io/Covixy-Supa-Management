import { Check } from "lucide-react";

export function Stepper({ steps, current }: { steps: string[]; current: number }) {
  return (
    <ol className="flex flex-wrap gap-3">
      {steps.map((label, index) => {
        const done = index < current;
        const active = index === current;
        return (
          <li key={label} className="flex items-center gap-2">
            <span
              className={`grid h-7 w-7 place-items-center rounded-full text-xs font-semibold ${
                active || done ? "bg-blue text-white" : "bg-blue-soft text-muted"
              }`}
            >
              {done ? <Check size={14} /> : index + 1}
            </span>
            <span className={`text-sm font-medium ${active ? "text-ink" : "text-muted"}`}>{label}</span>
            {index < steps.length - 1 ? <span className="bg-line mx-1 hidden h-px w-6 sm:block" /> : null}
          </li>
        );
      })}
    </ol>
  );
}
