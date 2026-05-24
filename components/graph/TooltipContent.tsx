"use client";

import type { TooltipProps } from "recharts";
import { formatMetricValue } from "@/lib/format";
import type { ChartSeries, NormalizationMode } from "./chartTypes";
import { getRawValueKey } from "./chartTypes";

type TooltipPayloadEntry = NonNullable<TooltipProps<number, string>["payload"]>[number];

type Props = TooltipProps<number, string> & {
  hoveredSeriesId?: string | null;
  normalization: NormalizationMode;
  series: ChartSeries[];
};

export function TooltipContent({
  active,
  payload,
  label,
  hoveredSeriesId,
  normalization,
  series,
}: Props) {
  const entry =
    ((payload ?? []).find((item) => item.dataKey?.toString() === hoveredSeriesId) ?? null) as TooltipPayloadEntry | null;

  if (!active || !hoveredSeriesId || !entry || typeof entry.value !== "number" || !Number.isFinite(entry.value)) {
    return null;
  }

  const seriesConfig = series.find((item) => item.id === hoveredSeriesId);
  const seriesLabel = seriesConfig?.label ?? entry.name?.toString() ?? entry.dataKey?.toString() ?? "Series";
  const rawValue = entry.payload?.[getRawValueKey(hoveredSeriesId)];
  const color = (entry.color as string) ?? "#0f172a";

  return (
    <div className="w-56 rounded-xl border border-slate-200 bg-white/95 px-4 py-3 shadow-lg backdrop-blur-sm sm:w-60">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Year {label}</p>
      <div className="mt-2 flex items-center gap-2">
        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} aria-hidden />
        <p className="text-sm font-semibold text-slate-900">{seriesLabel}</p>
      </div>
      <p className="mt-2 text-lg font-semibold text-slate-900">
        {formatMetricValue(entry.value, seriesConfig?.unit ?? undefined, { mode: normalization })}
      </p>
      {normalization === "indexed" && typeof rawValue === "number" && Number.isFinite(rawValue) ? (
        <p className="mt-1 text-xs text-slate-500">
          Raw: {formatMetricValue(rawValue, seriesConfig?.unit ?? undefined)}
        </p>
      ) : null}
    </div>
  );
}
