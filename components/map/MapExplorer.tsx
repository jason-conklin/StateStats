"use client";

import { Feature, Geometry } from "geojson";
import { ArrowDown, EyeOff, RotateCcw, Table2 } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Legend } from "./Legend";
import { USChoropleth } from "./USChoropleth";
import { useMapZoom } from "./useMapZoom";
import { createContinuousColorScale, createQuantizeColorScale } from "@/lib/mapScales";
import { formatMetricValue } from "@/lib/format";
import { StateInfo } from "@/lib/types";
import { DataTablePanel } from "./DataTablePanel";
import { MetricSelect } from "@/components/controls/MetricSelect";

type MetricData = {
  id: string;
  name: string;
  unit?: string | null;
  description?: string | null;
  sourceName?: string | null;
  category?: string | null;
  isDefault?: boolean | null;
  years: number[];
  minYear: number | null;
  maxYear: number | null;
  dataByYear: Record<number, Record<string, number | null>>;
  minValue: number | null;
  maxValue: number | null;
};

type Props = {
  metrics: MetricData[];
  defaultMetricId: string;
  defaultYear: number;
  states: StateInfo[];
  features: Feature<Geometry, { stateId?: string; name?: string; abbreviation?: string }>[];
};

type TooltipState = {
  stateId: string;
  x: number;
  y: number;
};

function getYearDomain(valuesForYear: Record<string, number | null> | undefined): [number, number] | null {
  if (!valuesForYear) return null;
  const vals = Object.values(valuesForYear).filter((v): v is number => typeof v === "number" && !Number.isNaN(v));
  if (!vals.length) return null;
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  if (!Number.isFinite(min) || !Number.isFinite(max) || min === max) return null;
  return [min, max];
}

function buildMajorYearTicks(yearMin: number, yearMax: number): number[] {
  if (!Number.isFinite(yearMin) || !Number.isFinite(yearMax)) return [];
  if (yearMax <= yearMin) return [yearMin];

  const range = yearMax - yearMin;
  const step = range <= 25 ? 5 : 10;
  const ticks = new Set<number>([yearMin, yearMax]);
  const firstAlignedTick = Math.ceil(yearMin / step) * step;

  for (let year = firstAlignedTick; year < yearMax; year += step) {
    if (year > yearMin) ticks.add(year);
  }

  return Array.from(ticks).sort((a, b) => a - b);
}

function buildMobileYearTicks(yearMin: number, yearMax: number): number[] {
  if (!Number.isFinite(yearMin) || !Number.isFinite(yearMax)) return [];
  if (yearMax <= yearMin) return [yearMin];

  const midpoint = Math.round((yearMin + yearMax) / 2);
  return Array.from(new Set([yearMin, midpoint, yearMax])).sort((a, b) => a - b);
}

function getTickOffsetPercent(year: number, yearMin: number, yearMax: number): number {
  if (yearMax <= yearMin) return 0;
  return ((year - yearMin) / (yearMax - yearMin)) * 100;
}

export function MapExplorer({ metrics, defaultMetricId, defaultYear, states, features }: Props) {
  const metricMap = useMemo(() => {
    const map = new Map<string, MetricData>();
    metrics.forEach((metric) => map.set(metric.id, metric));
    return map;
  }, [metrics]);

  const [selectedMetricId, setSelectedMetricId] = useState<string>(defaultMetricId);
  const [selectedYear, setSelectedYear] = useState<number>(defaultYear);
  const [hovered, setHovered] = useState<TooltipState | null>(null);
  const [pinnedStateId, setPinnedStateId] = useState<string | null>(null);
  const [isTableOpen, setIsTableOpen] = useState(false);
  const [isLegendOpen, setIsLegendOpen] = useState(true);
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mobileDataTableRef = useRef<HTMLElement | null>(null);
  const [mapContainerWidth, setMapContainerWidth] = useState(0);
  const [legendPosition, setLegendPosition] = useState<{ x: number; y: number }>({ x: 12, y: 580 });
  const legendWasDraggedRef = useRef(false);
  const lastLegendViewportRef = useRef<"mobile" | "desktop" | null>(null);
  const dragRef = useRef<{ isDragging: boolean; didDrag: boolean; offsetX: number; offsetY: number }>({
    isDragging: false,
    didDrag: false,
    offsetX: 0,
    offsetY: 0,
  });
  const {
    transform: mapTransform,
    hasFinePointer,
    isPanning: isMapPanning,
    isZoomed,
    reset: resetMapZoom,
    handleWheel: handleMapWheel,
    handlePointerDown: handleMapPointerDown,
    handlePointerMove: handleMapPointerMove,
    handlePointerUp: handleMapPointerUp,
    handlePointerCancel: handleMapPointerCancel,
    consumeClickSuppressed,
  } = useMapZoom({ containerRef: mapContainerRef });

  const selectedMetric = metricMap.get(selectedMetricId) ?? metrics[0];
  const yearMin = selectedMetric?.minYear ?? selectedMetric?.years[0] ?? selectedYear ?? 0;
  const yearMax =
    selectedMetric?.maxYear ?? selectedMetric?.years[selectedMetric.years.length - 1] ?? selectedYear ?? 0;
  const sliderValue =
    selectedMetric && selectedMetric.years.length ? Math.min(Math.max(selectedYear, yearMin), yearMax) : yearMax;
  const yearRange = Math.max(1, yearMax - yearMin);
  const fillPct = selectedMetric?.years.length
    ? Math.min(100, Math.max(0, ((sliderValue - yearMin) / yearRange) * 100))
    : 0;
  const majorYearTicks = useMemo(() => buildMajorYearTicks(yearMin, yearMax), [yearMin, yearMax]);
  const mobileYearTicks = useMemo(() => buildMobileYearTicks(yearMin, yearMax), [yearMin, yearMax]);
  const trackRegionStyle = {
    width: "calc(100% - var(--ss-thumb))",
    transform: "translateX(calc(var(--ss-thumb) / 2))",
  } as const;

  const valuesByStateId = useMemo(() => selectedMetric?.dataByYear[selectedYear] ?? {}, [selectedMetric, selectedYear]);

  const rankByStateId = useMemo(() => {
    const entries = Object.entries(valuesByStateId).filter(
      ([, value]) => value !== null && value !== undefined && !Number.isNaN(value),
    ) as [string, number][];
    const sorted = entries.sort((a, b) => b[1] - a[1]);
    const ranks: Record<string, number> = {};
    sorted.forEach(([stateId], index) => {
      ranks[stateId] = index + 1;
    });
    return ranks;
  }, [valuesByStateId]);

  const globalMin = selectedMetric?.minValue ?? null;
  const globalMax = selectedMetric?.maxValue ?? null;
  const yearDomain = useMemo(() => getYearDomain(selectedMetric?.dataByYear[selectedYear]), [selectedMetric, selectedYear]);
  const colorDomain = useMemo(() => {
    if (yearDomain) return yearDomain;
    if (globalMin !== null && globalMax !== null && globalMin !== globalMax) return [globalMin, globalMax] as [number, number];
    return null;
  }, [yearDomain, globalMin, globalMax]);

  const { colorScale, gradient } = useMemo(() => {
    if (!colorDomain) {
      return { colorScale: null, gradient: "" };
    }
    const { colorScale } = createQuantizeColorScale(colorDomain[0], colorDomain[1]);
    const { gradient } = createContinuousColorScale(colorDomain[0], colorDomain[1]);
    return { colorScale, gradient };
  }, [colorDomain]);

  const tooltipContent = useMemo(() => {
    if (!hovered) return null;
    const state = states.find((s) => s.id === hovered.stateId);
    const value = valuesByStateId[hovered.stateId] ?? null;
    const rank = rankByStateId[hovered.stateId];
    return {
      stateName: state?.name ?? hovered.stateId,
      value,
      rank,
      position: { x: hovered.x, y: hovered.y },
    };
  }, [hovered, states, valuesByStateId, rankByStateId]);

  const pinnedCard = useMemo(() => {
    if (!pinnedStateId) return null;
    const state = states.find((s) => s.id === pinnedStateId);
    const value = valuesByStateId[pinnedStateId] ?? null;
    const rank = rankByStateId[pinnedStateId];
    return { state, value, rank };
  }, [pinnedStateId, states, valuesByStateId, rankByStateId]);

  const tooltipStyle = useMemo(() => {
    if (!tooltipContent) return null;

    const edgePadding = 8;
    const defaultOffset = 8;
    const top = tooltipContent.position.y + defaultOffset;
    let left = tooltipContent.position.x + defaultOffset;

    if (!mapContainerWidth || mapContainerWidth >= 640) {
      return { left, top };
    }

    const tooltipWidth = 176;
    const rightEdge = left + tooltipWidth;
    if (rightEdge > mapContainerWidth - edgePadding) {
      left = Math.max(edgePadding, tooltipContent.position.x - tooltipWidth - defaultOffset);
    }

    const maxLeft = Math.max(edgePadding, mapContainerWidth - tooltipWidth - edgePadding);
    left = Math.min(left, maxLeft);

    return { left, top };
  }, [mapContainerWidth, tooltipContent]);

  const tableRows = useMemo(() => {
    return states
      .map((state) => ({
        ...state,
        value: valuesByStateId[state.id] ?? null,
        rank: rankByStateId[state.id] ?? null,
      }))
      .sort((a, b) => {
        if (a.value === null && b.value === null) return a.name.localeCompare(b.name);
        if (a.value === null) return 1;
        if (b.value === null) return -1;
        return b.value - a.value;
      });
  }, [states, valuesByStateId, rankByStateId]);

  const setTableOpen = useCallback((next: boolean) => {
    setIsTableOpen(next);
    window.dispatchEvent(new CustomEvent("statestats:table-toggle", { detail: { open: next } }));
  }, []);

  const handleMetricSelect = useCallback(
    (nextMetricId: string) => {
      setSelectedMetricId(nextMetricId);
      const nextMetric = metrics.find((metric) => metric.id === nextMetricId);
      const latestYearValue = nextMetric?.years[nextMetric.years.length - 1];
      if (typeof latestYearValue === "number") {
        setSelectedYear(latestYearValue);
      }
    },
    [metrics],
  );

  const handleStateClick = (stateId: string) => {
    setPinnedStateId(stateId);
    if (stateId) setTableOpen(true);
  };

  const handleViewMobileDataTable = useCallback(() => {
    const prefersReducedMotion =
      typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    mobileDataTableRef.current?.scrollIntoView({
      behavior: prefersReducedMotion ? "auto" : "smooth",
      block: "start",
    });
  }, []);

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      if (!dragRef.current.isDragging || !mapContainerRef.current) return;
      const rect = mapContainerRef.current.getBoundingClientRect();
      const x = event.clientX - rect.left - dragRef.current.offsetX;
      const y = event.clientY - rect.top - dragRef.current.offsetY;
      const clampedX = Math.min(Math.max(0, x), rect.width - 180);
      const clampedY = Math.min(Math.max(0, y), rect.height - 100);
      dragRef.current.didDrag = true;
      legendWasDraggedRef.current = true;
      setLegendPosition({ x: clampedX, y: clampedY });
    };

    const handlePointerUp = () => {
      dragRef.current.isDragging = false;
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
    };
  }, []);

  useEffect(() => {
    const container = mapContainerRef.current;
    if (!container) return;

    const updateWidth = () => {
      const nextWidth = Math.round(container.getBoundingClientRect().width);
      setMapContainerWidth((current) => {
        return current === nextWidth ? current : nextWidth;
      });

      if (!legendWasDraggedRef.current && typeof window !== "undefined") {
        const viewportMode = window.innerWidth < 640 ? "mobile" : "desktop";
        if (lastLegendViewportRef.current !== viewportMode) {
          setLegendPosition({
            x: 12,
            y: viewportMode === "mobile" ? 245 : 580,
          });
          lastLegendViewportRef.current = viewportMode;
        }
      }
    };

    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    observer.observe(container);

    return () => observer.disconnect();
  }, []);

  const startDrag = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    if (!mapContainerRef.current) return;
    const rect = mapContainerRef.current.getBoundingClientRect();
    dragRef.current.isDragging = true;
    dragRef.current.didDrag = false;
    dragRef.current.offsetX = event.clientX - rect.left - legendPosition.x;
    dragRef.current.offsetY = event.clientY - rect.top - legendPosition.y;
    (event.target as HTMLElement).setPointerCapture(event.pointerId);
  };

  const handleLegendToggle = () => {
    if (dragRef.current.isDragging || dragRef.current.didDrag) {
      // Prevent toggling when the user just dragged.
      dragRef.current.didDrag = false;
      return;
    }
    setIsLegendOpen((prev) => !prev);
  };

  // Close the data table when the sidebar expands.
  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ collapsed?: boolean }>).detail;
      if (detail && detail.collapsed === false) {
        setTableOpen(false);
      }
    };
    window.addEventListener("statestats:sidebar-toggle", handler as EventListener);
    return () => window.removeEventListener("statestats:sidebar-toggle", handler as EventListener);
  }, [setTableOpen]);

  return (
    <div className="w-full min-h-[100svh] bg-sky-100 md:h-[calc(100vh-0px)] md:min-h-0 md:bg-slate-50">
      <section className="relative w-full min-h-[100svh] md:h-full md:min-h-0">
        <div className="pointer-events-none absolute inset-x-0 top-1 z-20 hidden md:block">
          <div className="mx-auto w-full max-w-[1100px] px-3">
            <div className="pointer-events-auto rounded-xl border border-white/40 bg-white/55 px-3 py-2 shadow-sm backdrop-blur-md">
              <div className="flex w-full max-w-[980px] min-w-0 items-start gap-3 overflow-visible">
                <div className="min-w-0 w-[min(380px,46vw)]">
                  <MetricSelect
                    metrics={metrics}
                    value={selectedMetric?.id ?? ""}
                    onChange={handleMetricSelect}
                    className="w-full min-w-0"
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="relative mt-1 min-w-0 pr-[3.35rem] pt-0.5">
                    <div className="w-full">
                          <div className="relative">
                            <div className="pointer-events-none absolute inset-0 flex items-center" aria-hidden>
                              <div className="relative h-1.5" style={trackRegionStyle}>
                                <span className="absolute inset-0 rounded-full bg-slate-300/70" />
                                <span
                                  className="absolute inset-y-0 left-0 rounded-full bg-emerald-500/35 shadow-[inset_0_1px_0_rgba(255,255,255,0.35)]"
                                  style={{ width: `${fillPct}%` }}
                                />
                              </div>
                            </div>

                            <input
                              type="range"
                              min={yearMin}
                              max={yearMax}
                              value={sliderValue}
                              onChange={(e) => setSelectedYear(Number(e.target.value))}
                              className="ss-year-slider relative z-10 w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50 focus-visible:ring-offset-1 focus-visible:ring-offset-transparent"
                              step={1}
                              aria-label="Select year"
                              disabled={!selectedMetric?.years.length}
                            />
                          </div>

                          <div className="mt-1 h-6 select-none" aria-hidden>
                            <div className="relative h-full" style={trackRegionStyle}>
                              {majorYearTicks.map((tick, index) => {
                                const isSelectedTick = tick === sliderValue;
                                const isFirst = index === 0;
                                const isLast = index === majorYearTicks.length - 1;
                                const left = getTickOffsetPercent(tick, yearMin, yearMax);
                                return (
                                  <div
                                    key={`desktop-major-tick-${tick}`}
                                    className="absolute top-0"
                                    style={{ left: `${left}%` }}
                                  >
                                    <span
                                      className={`block w-px -translate-x-1/2 ${
                                        isSelectedTick ? "h-2.5 bg-slate-700" : "h-2 bg-slate-400/60"
                                      }`}
                                    />
                                    <span
                                      className={`mt-0.5 block text-[10px] tabular-nums select-none ${
                                        isSelectedTick ? "font-semibold text-slate-900" : "text-slate-500"
                                      } ${
                                        isFirst
                                          ? "translate-x-0 text-left"
                                          : isLast
                                            ? "-translate-x-full text-right"
                                            : "-translate-x-1/2 text-center"
                                      }`}
                                    >
                                      {tick}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                    <div className="absolute right-0 top-0 flex w-[3.1rem] flex-col items-center gap-1 text-center">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-500">Year</p>
                      <span className="flex-none rounded-full bg-slate-900 px-2.5 py-0.5 text-xs font-semibold tabular-nums text-white">
                        {selectedMetric?.years.length ? selectedYear : "—"}
                      </span>
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setTableOpen(!isTableOpen)}
                  className={`flex-none cursor-pointer items-center gap-2 rounded-xl border px-4 py-2 text-sm font-medium transition-all duration-150 ease-out ring-1 ring-white/70 shadow-[0_1px_2px_rgba(15,23,42,0.06),0_6px_16px_rgba(15,23,42,0.10)] hover:-translate-y-[1px] hover:shadow-[0_2px_4px_rgba(15,23,42,0.08),0_10px_22px_rgba(15,23,42,0.14)] active:translate-y-[1px] active:shadow-[0_1px_2px_rgba(15,23,42,0.06)] active:ring-white/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/60 focus-visible:ring-offset-1 focus-visible:ring-offset-transparent md:inline-flex ${
                    isTableOpen
                      ? "border-slate-300 bg-gradient-to-b from-slate-100 to-slate-200/70 text-slate-800 hover:from-slate-100 hover:to-slate-200 active:to-slate-200/90"
                      : "border-slate-200 bg-gradient-to-b from-white to-slate-50 text-slate-700 hover:from-white hover:to-slate-100 active:to-slate-100"
                  }`}
                >
                  {isTableOpen ? <EyeOff className="h-4 w-4 shrink-0" aria-hidden /> : <Table2 className="h-4 w-4 shrink-0" aria-hidden />}
                  {isTableOpen ? "Hide table" : "Data table"}
                </button>
              </div>
              <p className="mt-0 truncate text-right text-[10px] leading-none text-slate-600">
                Data through {selectedMetric?.maxYear ?? "—"} for {selectedMetric?.name ?? "this metric"}
              </p>
            </div>
          </div>
        </div>
        <div
          className={`relative flex min-h-[100svh] w-full flex-col overflow-x-hidden ss-water transition-[padding] duration-200 md:h-[calc(100vh-0px)] md:min-h-0 md:overflow-hidden ${
            isTableOpen ? "md:pr-[392px]" : "md:pr-0"
          }`}
        >
          <div className="relative z-20 w-full md:hidden">
            <div className="mx-auto w-full max-w-[1100px] px-3 py-2">
              <div className="pointer-events-auto rounded-2xl border border-white/40 bg-white/55 px-3 py-2 shadow-sm backdrop-blur-md md:rounded-xl">
                <div className="flex w-full max-w-[980px] min-w-0 flex-col gap-2.5 overflow-visible sm:flex-row sm:items-start sm:gap-3">
                  <div className="min-w-0 w-full sm:w-[min(380px,46vw)]">
                    <MetricSelect
                      metrics={metrics}
                      value={selectedMetric?.id ?? ""}
                      onChange={handleMetricSelect}
                      className="w-full min-w-0"
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="rounded-xl border border-white/45 bg-white/30 px-3 py-2 sm:hidden">
                      <div className="relative min-w-0 px-0.5 pr-[2.85rem]">
                          <div className="relative">
                            <div className="pointer-events-none absolute inset-0 flex items-center" aria-hidden>
                              <div className="relative h-1.5" style={trackRegionStyle}>
                                <span className="absolute inset-0 rounded-full bg-slate-300/70" />
                                <span
                                  className="absolute inset-y-0 left-0 rounded-full bg-emerald-500/35 shadow-[inset_0_1px_0_rgba(255,255,255,0.35)]"
                                  style={{ width: `${fillPct}%` }}
                                />
                              </div>
                            </div>

                            <input
                              type="range"
                              min={yearMin}
                              max={yearMax}
                              value={sliderValue}
                              onChange={(e) => setSelectedYear(Number(e.target.value))}
                              className="ss-year-slider ss-year-slider-touch relative z-10 w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50 focus-visible:ring-offset-1 focus-visible:ring-offset-transparent"
                              step={1}
                              aria-label="Select year"
                              disabled={!selectedMetric?.years.length}
                            />
                          </div>

                          <div className="mt-1 h-5 select-none" aria-hidden>
                            <div className="relative h-full" style={trackRegionStyle}>
                              {mobileYearTicks.map((tick, index) => {
                                const isSelectedTick = tick === sliderValue;
                                const isFirst = index === 0;
                                const isLast = index === mobileYearTicks.length - 1;
                                const left = getTickOffsetPercent(tick, yearMin, yearMax);
                                return (
                                  <div
                                    key={`mobile-tick-${tick}`}
                                    className="absolute top-0"
                                    style={{ left: `${left}%` }}
                                  >
                                    <span
                                      className={`block w-px -translate-x-1/2 ${
                                        isSelectedTick ? "h-2.5 bg-slate-700" : "h-1.5 bg-slate-400/55"
                                      }`}
                                    />
                                    <span
                                      className={`mt-0.5 block text-[8px] leading-none tabular-nums select-none ${
                                        isSelectedTick ? "font-semibold text-slate-900" : "text-slate-500"
                                      } ${
                                        isFirst
                                          ? "translate-x-0 text-left"
                                          : isLast
                                            ? "-translate-x-full text-right"
                                            : "-translate-x-1/2 text-center"
                                      }`}
                                    >
                                      {tick}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        <div className="absolute right-0 top-0 flex w-[2.65rem] flex-col items-center gap-1 text-center">
                          <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-slate-500">Year</p>
                          <span className="flex-none rounded-full bg-slate-900 px-2.5 py-0.5 text-[11px] font-semibold tabular-nums text-white">
                            {selectedMetric?.years.length ? selectedYear : "—"}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="hidden min-w-0 flex-1 sm:block">
                      <div className="relative min-w-0 pr-[3.35rem] pt-0.5">
                          <div className="w-full">
                            <div className="relative">
                              <div className="pointer-events-none absolute inset-0 flex items-center" aria-hidden>
                                <div className="relative h-1.5" style={trackRegionStyle}>
                                  <span className="absolute inset-0 rounded-full bg-slate-300/70" />
                                  <span
                                    className="absolute inset-y-0 left-0 rounded-full bg-emerald-500/35 shadow-[inset_0_1px_0_rgba(255,255,255,0.35)]"
                                    style={{ width: `${fillPct}%` }}
                                  />
                                </div>
                              </div>

                              <input
                                type="range"
                                min={yearMin}
                                max={yearMax}
                                value={sliderValue}
                                onChange={(e) => setSelectedYear(Number(e.target.value))}
                                className="ss-year-slider relative z-10 w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50 focus-visible:ring-offset-1 focus-visible:ring-offset-transparent"
                                step={1}
                                aria-label="Select year"
                                disabled={!selectedMetric?.years.length}
                              />
                            </div>

                            <div className="mt-1 h-6 select-none" aria-hidden>
                              <div className="relative h-full" style={trackRegionStyle}>
                                {majorYearTicks.map((tick, index) => {
                                  const isSelectedTick = tick === sliderValue;
                                  const isFirst = index === 0;
                                  const isLast = index === majorYearTicks.length - 1;
                                  const left = getTickOffsetPercent(tick, yearMin, yearMax);
                                  return (
                                    <div
                                      key={`major-tick-${tick}`}
                                      className="absolute top-0"
                                      style={{ left: `${left}%` }}
                                    >
                                      <span
                                        className={`block w-px -translate-x-1/2 ${
                                          isSelectedTick ? "h-2.5 bg-slate-700" : "h-2 bg-slate-400/60"
                                        }`}
                                      />
                                      <span
                                        className={`mt-0.5 block text-[10px] tabular-nums select-none ${
                                          isSelectedTick ? "font-semibold text-slate-900" : "text-slate-500"
                                        } ${
                                          isFirst
                                            ? "translate-x-0 text-left"
                                            : isLast
                                              ? "-translate-x-full text-right"
                                              : "-translate-x-1/2 text-center"
                                        }`}
                                      >
                                        {tick}
                                      </span>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          </div>
                          <div className="absolute right-0 top-0 flex w-[3.1rem] flex-col items-center gap-1 text-center">
                            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-500">Year</p>
                            <span className="flex-none rounded-full bg-slate-900 px-2.5 py-0.5 text-xs font-semibold tabular-nums text-white">
                              {selectedMetric?.years.length ? selectedYear : "—"}
                            </span>
                          </div>
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setTableOpen(!isTableOpen)}
                    className={`hidden flex-none cursor-pointer items-center gap-2 rounded-xl border px-4 py-2 text-sm font-medium transition-all duration-150 ease-out ring-1 ring-white/70 shadow-[0_1px_2px_rgba(15,23,42,0.06),0_6px_16px_rgba(15,23,42,0.10)] hover:-translate-y-[1px] hover:shadow-[0_2px_4px_rgba(15,23,42,0.08),0_10px_22px_rgba(15,23,42,0.14)] active:translate-y-[1px] active:shadow-[0_1px_2px_rgba(15,23,42,0.06)] active:ring-white/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/60 focus-visible:ring-offset-1 focus-visible:ring-offset-transparent md:inline-flex ${
                      isTableOpen
                        ? "border-slate-300 bg-gradient-to-b from-slate-100 to-slate-200/70 text-slate-800 hover:from-slate-100 hover:to-slate-200 active:to-slate-200/90"
                        : "border-slate-200 bg-gradient-to-b from-white to-slate-50 text-slate-700 hover:from-white hover:to-slate-100 active:to-slate-100"
                    }`}
                  >
                    {isTableOpen ? <EyeOff className="h-4 w-4 shrink-0" aria-hidden /> : <Table2 className="h-4 w-4 shrink-0" aria-hidden />}
                    {isTableOpen ? "Hide table" : "Data table"}
                  </button>
                </div>
                <p className="mt-0 truncate text-left text-[10px] leading-none text-slate-600 sm:text-right">
                  Data through {selectedMetric?.maxYear ?? "—"} for {selectedMetric?.name ?? "this metric"}
                </p>
              </div>
            </div>
          </div>

          <div className="relative z-10 w-full flex-1 min-h-[68svh] bg-transparent sm:min-h-0" ref={mapContainerRef}>
            {colorScale ? (
              <div className="relative h-full">
                <USChoropleth
                  features={features}
                  valuesByStateId={valuesByStateId}
                  colorScale={colorScale}
                  hoveredStateId={hovered?.stateId ?? null}
                  pinnedStateId={pinnedStateId}
                  onHover={(stateId, position) => {
                    if (!stateId || !position) {
                      setHovered(null);
                      return;
                    }
                    setHovered({ stateId, ...position });
                  }}
                  onClick={(stateId) => handleStateClick(stateId)}
                  selectedYear={selectedYear}
                  transform={mapTransform}
                  isPanning={isMapPanning}
                  onWheel={handleMapWheel}
                  onPointerDown={(event) => {
                    setHovered(null);
                    handleMapPointerDown(event);
                  }}
                  onPointerMove={handleMapPointerMove}
                  onPointerUp={handleMapPointerUp}
                  onPointerCancel={handleMapPointerCancel}
                  consumeClickSuppressed={consumeClickSuppressed}
                />
              </div>
            ) : null}

            {hasFinePointer && isZoomed ? (
              <button
                type="button"
                onClick={resetMapZoom}
                className="absolute left-4 top-4 z-20 inline-flex items-center gap-2 rounded-xl border border-slate-200/90 bg-white/92 px-3 py-2 text-xs font-medium text-slate-700 shadow-[0_6px_18px_rgba(15,23,42,0.08)] backdrop-blur-sm transition-colors hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/60 focus-visible:ring-offset-1 focus-visible:ring-offset-transparent"
              >
                <RotateCcw className="h-4 w-4 shrink-0" aria-hidden />
                Reset view
              </button>
            ) : null}

            {tooltipContent && tooltipStyle ? (
              <div
                className="pointer-events-none absolute z-20 w-40 rounded-xl border border-slate-200 bg-white/95 p-2.5 shadow-[0_8px_20px_rgba(0,0,0,0.12)] backdrop-blur-sm transition-all duration-150 ease-out sm:w-56 sm:p-3"
                style={tooltipStyle}
              >
                <p className="text-sm font-semibold text-slate-900 sm:text-base">{tooltipContent.stateName}</p>
                <p className="mt-1 text-base font-bold text-emerald-700 sm:text-lg">
                  {formatMetricValue(tooltipContent.value, selectedMetric?.unit ?? undefined)}
                </p>
                <div className="my-1.5 h-px bg-slate-200 sm:my-2" />
                {tooltipContent.rank ? (
                  <p className="text-xs text-slate-500">Rank {tooltipContent.rank} / {states.length}</p>
                ) : (
                  <p className="text-xs text-slate-500">No data</p>
                )}
              </div>
            ) : null}

            {/* Legend */}
            <div
              className="pointer-events-auto absolute z-10 w-48 max-w-[calc(100vw-2rem)] sm:w-60 sm:max-w-full"
              style={{ left: legendPosition.x, top: legendPosition.y }}
            >
              <div className="relative">
                <button
                  type="button"
                  onClick={handleLegendToggle}
                  onPointerDown={startDrag}
                  aria-expanded={isLegendOpen}
                  className="inline-flex cursor-grab touch-none items-center gap-2 rounded-xl border border-slate-200 bg-white/90 px-3 py-2 text-xs font-medium text-slate-700 shadow-sm backdrop-blur-sm hover:bg-white active:cursor-grabbing"
                >
                  <span className="h-2 w-2 rounded-full bg-[color:var(--ss-green-mid)]" aria-hidden />
                  Legend {isLegendOpen ? "▾" : "▸"}
                </button>
                {isLegendOpen ? (
                  <div className="absolute left-0 top-full z-10 mt-2 w-full">
                    <Legend
                      scaleType="continuous"
                      unitLabel={selectedMetric?.unit ?? undefined}
                      gradient={gradient}
                      domain={colorDomain}
                    />
                  </div>
                ) : null}
              </div>
            </div>

            {/* Pinned */}
              <div className="pointer-events-auto absolute bottom-28 right-2 z-10 max-w-full sm:bottom-4 sm:right-4">
                {pinnedCard && pinnedCard.state ? (
                  <>
                    <div className="flex w-44 flex-col gap-1.5 rounded-xl border border-[color:var(--ss-green-mid)]/30 bg-white/95 p-2.5 text-xs shadow-md backdrop-blur sm:hidden">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Pinned</p>
                        <button
                          type="button"
                          aria-label="Unpin state"
                          onClick={() => setPinnedStateId(null)}
                          className="cursor-pointer text-sm leading-none text-slate-500 hover:text-slate-700"
                        >
                          ✕
                        </button>
                      </div>
                      <p className="min-w-0 truncate text-lg font-semibold leading-tight text-slate-950">
                        {pinnedCard.state.name}
                      </p>
                      <div className="flex items-baseline justify-between gap-3">
                        <p className="text-base font-medium tabular-nums text-slate-800">
                          {formatMetricValue(pinnedCard.value, selectedMetric?.unit ?? undefined)}
                        </p>
                        {pinnedCard.rank ? (
                          <p className="whitespace-nowrap text-right text-xs tabular-nums text-slate-500">
                            Rank {pinnedCard.rank} / {states.length}
                          </p>
                        ) : (
                          <p className="whitespace-nowrap text-right text-xs text-slate-500">No data</p>
                        )}
                      </div>
                      <Link
                        href={`/graph?metric=${selectedMetric?.id ?? ""}&states=${pinnedCard.state.abbreviation ?? pinnedCard.state.id}&startYear=${selectedYear}&endYear=${selectedYear}`}
                        className="ml-auto inline-flex shrink-0 rounded-full border border-[color:var(--ss-green)] px-3 py-1 text-[10px] font-medium leading-tight text-[color:var(--ss-green)] hover:bg-[color:var(--ss-green-light)]"
                      >
                        Add to compare
                      </Link>
                    </div>
                    <div className="hidden w-64 flex-col gap-1 rounded-xl border border-[color:var(--ss-green-mid)]/30 bg-white/95 p-3 text-xs shadow-md backdrop-blur sm:flex">
                      <div className="flex items-start justify-between gap-1">
                        <p className="text-[9px] uppercase tracking-[0.2em] text-slate-500">Pinned</p>
                        <button
                          type="button"
                          aria-label="Unpin state"
                          onClick={() => setPinnedStateId(null)}
                          className="cursor-pointer text-xs leading-none text-slate-500 hover:text-slate-700"
                        >
                          ✕
                        </button>
                      </div>
                      <div className="flex items-end justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-slate-900">{pinnedCard.state.name}</p>
                          <p className="text-[10px] text-slate-700">
                            {formatMetricValue(pinnedCard.value, selectedMetric?.unit ?? undefined)}
                          </p>
                          {pinnedCard.rank ? (
                            <p className="text-[11px] text-slate-500">Rank {pinnedCard.rank} / {states.length}</p>
                          ) : (
                            <p className="text-[11px] text-slate-500">No data</p>
                          )}
                        </div>
                        <Link
                          href={`/graph?metric=${selectedMetric?.id ?? ""}&states=${pinnedCard.state.abbreviation ?? pinnedCard.state.id}&startYear=${selectedYear}&endYear=${selectedYear}`}
                          className="shrink-0 rounded-md border border-[color:var(--ss-green)] px-2 py-0.5 text-[9px] font-medium leading-tight text-[color:var(--ss-green)] hover:bg-[color:var(--ss-green-light)]"
                        >
                          Add to compare
                        </Link>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="hidden sm:block w-64 rounded-lg border border-dashed border-[color:var(--ss-green-mid)]/50 bg-white/90 p-3 text-xs text-slate-600 shadow-sm backdrop-blur opacity-70">
                    Click a state on the map to pin it.
                  </div>
                )}
              </div>

              <div className="pointer-events-auto absolute bottom-12 left-1/2 z-10 -translate-x-1/2 sm:hidden">
                <button
                  type="button"
                  onClick={handleViewMobileDataTable}
                  className="inline-flex items-center gap-2 rounded-full border border-white/50 bg-white/35 px-4 py-2 text-sm font-medium text-slate-700 shadow-[0_1px_8px_rgba(15,23,42,0.06)] backdrop-blur-[2px] transition hover:bg-white/50 active:scale-[0.98] active:bg-white/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/60"
                >
                  <span>View data table</span>
                  <ArrowDown className="h-4 w-4 shrink-0" aria-hidden />
                </button>
              </div>
            </div>
        </div>

        {/* Mobile inline data table */}
        <section
          ref={mobileDataTableRef}
          className="relative z-10 -mt-px w-full scroll-mt-20 px-3 pb-[calc(5rem+env(safe-area-inset-bottom))] pt-5 sm:hidden"
        >
          <div className="w-full">
            <DataTablePanel
              year={selectedYear}
              metrics={metrics}
              selectedMetricId={selectedMetric?.id ?? ""}
              onMetricChange={handleMetricSelect}
              metricName={selectedMetric?.name}
              metricUnit={selectedMetric?.unit}
              rows={tableRows.map((row) => ({
                rank: row.rank ?? null,
                stateId: row.id,
                stateName: row.name,
                value: row.value,
                displayValue: formatMetricValue(row.value, selectedMetric?.unit ?? undefined),
              }))}
              selectedStateId={pinnedStateId}
              isOpen
              onToggle={() => {}}
            />
          </div>
        </section>

        {/* Desktop overlay table */}
        <div className="hidden sm:block">
          <DataTablePanel
            year={selectedYear}
            metrics={metrics}
            selectedMetricId={selectedMetric?.id ?? ""}
            onMetricChange={handleMetricSelect}
            metricName={selectedMetric?.name}
            metricUnit={selectedMetric?.unit}
            rows={tableRows.map((row) => ({
              rank: row.rank ?? null,
              stateId: row.id,
              stateName: row.name,
              value: row.value,
              displayValue: formatMetricValue(row.value, selectedMetric?.unit ?? undefined),
            }))}
            selectedStateId={pinnedStateId}
            isOpen={isTableOpen}
            onToggle={() => setTableOpen(!isTableOpen)}
            showLauncher={false}
          />
        </div>
      </section>
    </div>
  );
}
