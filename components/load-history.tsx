import type { LoadSample } from "@/lib/analytics";

function niceCeil(value: number): number {
  if (value <= 0) return 1000;
  const power = 10 ** Math.floor(Math.log10(value));
  const scaled = value / power;
  const step = scaled <= 1 ? 1 : scaled <= 2 ? 2 : scaled <= 5 ? 5 : 10;
  return step * power;
}

function mb(value: number): string {
  return `${Math.round(value).toLocaleString("en-US")} MB`;
}

function clock(ms: number): string {
  return new Date(ms).toISOString().slice(11, 16);
}

export function LoadHistory({ samples, capacityMb }: { samples: LoadSample[]; capacityMb: number }) {
  const width = 640;
  const height = 180;
  const pad = { top: 12, right: 12, bottom: 28, left: 72 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;
  const capacity = Math.max(capacityMb, ...samples.map((sample) => sample.availableMb), 1);
  const yMax = niceCeil(Math.max(capacity, ...samples.map((sample) => sample.usedMb), 1));
  const end = samples.length ? new Date(samples[samples.length - 1].at).getTime() : Date.now();
  const start = samples.length > 1 ? new Date(samples[0].at).getTime() : end - 60 * 60 * 1000;
  const span = Math.max(end - start, 1);
  const windowLabel = span <= 2 * 60 * 60 * 1000 ? "Past hour" : span <= 36 * 60 * 60 * 1000 ? "Past 24 hours" : "Load history";
  const yOf = (value: number) => pad.top + plotH - (value / yMax) * plotH;
  const xOf = (at: number) => pad.left + ((at - start) / span) * plotW;
  const points =
    samples.length === 0
      ? []
      : samples.length === 1
        ? [
            { x: pad.left, y: yOf(samples[0].usedMb) },
            { x: pad.left + plotW, y: yOf(samples[0].usedMb) },
          ]
        : samples.map((sample) => ({ x: xOf(new Date(sample.at).getTime()), y: yOf(sample.usedMb) }));
  const line = points.map((point, index) => `${index === 0 ? "M" : "L"}${point.x} ${point.y}`).join(" ");
  const area =
    points.length > 0
      ? `${line} L${points[points.length - 1].x} ${pad.top + plotH} L${points[0].x} ${pad.top + plotH} Z`
      : "";
  const yTicks = [yMax, yMax / 2, 0];
  const xTicks = [start, start + span / 2, end];

  return (
    <div className="card p-5">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-sm font-semibold">Load history</p>
        <p className="text-muted text-sm">{windowLabel}</p>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="mt-3 h-48 w-full" role="img" aria-label={`${windowLabel}, 0 to ${mb(yMax)}`}>
        <defs>
          <linearGradient id="load-area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--blue)" stopOpacity="0.35" />
            <stop offset="100%" stopColor="var(--blue)" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        {yTicks.map((tick) => (
          <g key={tick}>
            <line x1={pad.left} x2={width - pad.right} y1={yOf(tick)} y2={yOf(tick)} stroke="var(--line)" strokeWidth="1" />
            <text x={pad.left - 8} y={yOf(tick) + 4} textAnchor="end" fill="var(--muted)" fontSize="12">
              {mb(tick)}
            </text>
          </g>
        ))}
        {area ? <path d={area} fill="url(#load-area)" /> : null}
        {line ? <path d={line} fill="none" stroke="var(--blue)" strokeWidth="2" /> : null}
        {xTicks.map((tick) => (
          <text key={tick} x={xOf(tick)} y={height - 6} textAnchor="middle" fill="var(--muted)" fontSize="12">
            {clock(tick)}
          </text>
        ))}
      </svg>
      <p className="text-muted text-sm">
        {samples.length === 0
          ? "No samples yet. The scale is ready for the next reading."
          : "A sample is stored at most every five minutes. The filled area is load against capacity."}
      </p>
    </div>
  );
}
