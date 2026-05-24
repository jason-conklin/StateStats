'use client';

import { LegendTick, QuantizeBucket } from "@/lib/mapScales";
import { formatLegendValue, formatMetricValue } from "@/lib/format";

type LegendProps =
  | {
      scaleType: "quantize";
      unitLabel?: string | null;
      buckets: QuantizeBucket[];
      domain: [number, number] | null;
    }
  | {
      scaleType: "continuous";
      unitLabel?: string | null;
      domain: [number, number] | null;
      gradient: string;
      ticks?: LegendTick[];
    };

export function Legend(props: LegendProps) {
  const domainMin = props.domain?.[0] ?? null;
  const domainMax = props.domain?.[1] ?? null;
  const unitLabel = props.unitLabel ?? undefined;
  const legendTicks = props.scaleType === "continuous" ? (props.ticks ?? []) : [];

  return (
    <div className="w-full max-w-[calc(100vw-2rem)] rounded-xl border border-slate-200 bg-white/95 p-3 shadow-[0_8px_20px_rgba(0,0,0,0.1)] backdrop-blur-sm sm:max-w-full sm:p-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-[color:var(--ss-green-dark)]">Legend</p>
        {props.unitLabel ? <span className="text-xs text-slate-500">{props.unitLabel}</span> : null}
      </div>
      {props.scaleType === "quantize" ? (
        <div className="mt-2 space-y-2">
          <div className="flex flex-col gap-1 text-xs text-slate-700">
            {props.buckets.map((bucket, index) => (
              <div key={`${bucket.color}-${index}`} className="flex items-center gap-2">
                <span
                  className="h-2 w-3 rounded-sm border border-[color:var(--ss-green-mid)]/50"
                  style={{ backgroundColor: bucket.color }}
                />
                <span className={`truncate ${index === props.buckets.length - 1 ? "font-semibold" : ""}`}>{bucket.label}</span>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between text-xs text-slate-600">
            <span>{domainMin !== null ? formatMetricValue(domainMin, props.unitLabel ?? undefined) : "–"}</span>
            <span>{domainMax !== null ? formatMetricValue(domainMax, props.unitLabel ?? undefined) : "–"}</span>
          </div>
        </div>
      ) : (
        <div className="mt-2 space-y-2">
          <div>
            <div
              className="h-2 rounded-md border border-[color:var(--ss-green-mid)]/50 shadow-inner"
              style={{ backgroundImage: props.gradient }}
            />
            {legendTicks.length ? (
              <div className="relative mt-1.5 h-7 text-[10px] text-slate-600">
                {legendTicks.map((tick, index) => {
                  const isFirst = index === 0;
                  const isLast = index === legendTicks.length - 1;
                  return (
                    <span
                      key={`${tick.value}-${tick.offsetPct}`}
                      className={`absolute top-0 tabular-nums ${
                        isFirst
                          ? "translate-x-0 text-left"
                          : isLast
                            ? "-translate-x-full text-right"
                            : "-translate-x-1/2 text-center"
                      }`}
                      style={{ left: `${tick.offsetPct}%` }}
                    >
                      {formatLegendValue(tick.value)}
                    </span>
                  );
                })}
              </div>
            ) : (
              <div className="mt-2 flex items-center justify-between gap-4 text-xs text-slate-600">
                <span className="min-w-0 flex-1 text-left tabular-nums">
                  <span className="sm:hidden">
                    {domainMin !== null ? formatMetricValue(domainMin, unitLabel, { compact: true }) : "–"}
                  </span>
                  <span className="hidden sm:inline">
                    {domainMin !== null ? formatMetricValue(domainMin, unitLabel) : "–"}
                  </span>
                </span>
                <span className="min-w-0 flex-1 text-right tabular-nums">
                  <span className="sm:hidden">
                    {domainMax !== null ? formatMetricValue(domainMax, unitLabel, { compact: true }) : "–"}
                  </span>
                  <span className="hidden sm:inline">
                    {domainMax !== null ? formatMetricValue(domainMax, unitLabel) : "–"}
                  </span>
                </span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
