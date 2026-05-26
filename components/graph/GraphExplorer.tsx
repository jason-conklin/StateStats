"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { usePathname, useRouter } from "next/navigation";
import { MousePointer2 } from "lucide-react";
import {
  MetricSelect,
  getMetricGroup,
  getMetricIcon,
  type MetricGroup,
  type MetricOption as SharedMetricOption,
} from "@/components/controls/MetricSelect";
import { StateInfo } from "@/lib/types";
import {
  ChartDataRow,
  ChartSeries,
  ComparisonMode,
  NormalizationMode,
  SeriesPoint,
  SeriesStyle,
  SeriesStyleMap,
  getRawValueKey,
} from "./chartTypes";
import { SeriesStylePopover, type PopoverAnchorRect } from "./SeriesStylePopover";
import { getMetricSeriesStyle, getStateSeriesStyle } from "./seriesStyle";

type MetricOption = SharedMetricOption & {
  description?: string | null;
};

type StateSeries = {
  stateId: string;
  stateName: string;
  points: SeriesPoint[];
};

type MetricSeries = {
  metricId: string;
  metricName: string;
  unit?: string | null;
  points: SeriesPoint[];
};

type Props = {
  metrics: MetricOption[];
  states: StateInfo[];
  initialMode: ComparisonMode;
  initialMetricId: string;
  initialSelectedStates: string[];
  initialSelectedStateId: string;
  initialSelectedMetricIds: string[];
  availableYears: number[];
  initialYearRange: { start: number; end: number };
  initialNormalization: NormalizationMode;
  initialStateSeries: StateSeries[];
  initialMetricSeries: MetricSeries[];
};

type ChartContainerProps = {
  chartData: ChartDataRow[];
  series: ChartSeries[];
  normalization: NormalizationMode;
  yAxisUnit?: string | null;
  onZoomChange?: (isZoomed: boolean) => void;
};

type StateGraphResponse = {
  availableYears: number[];
  series: StateSeries[];
};

type MetricGraphResponse = {
  availableYears: number[];
  series: MetricSeries[];
};

const METRIC_GROUP_ORDER: MetricGroup[] = ["Money", "People", "Weather", "Other"];
const SERIES_STYLE_STORAGE_KEY = "statestats.chartSeriesStyles.v1";
const EMPTY_STYLE_MAPS: Record<ComparisonMode, SeriesStyleMap> = {
  states: {},
  metrics: {},
};
const EMPTY_STYLE_MAP: SeriesStyleMap = {};
const RAW_NONNEGATIVE_METRIC_IDS = new Set([
  "annual_precipitation",
  "annual_snowfall",
  "average_annual_temperature",
  "earthquake_count",
  "median_age",
  "median_home_value",
  "median_household_income",
  "population_total",
  "tornado_count",
  "unemployment_rate",
]);

const ChartContainer = dynamic<ChartContainerProps>(
  () => import("./GraphInner").then((mod) => mod.default),
  { ssr: false },
);

function getYearRangeFromYears(years: number[]) {
  const start = years[0] ?? new Date().getFullYear();
  const end = years[years.length - 1] ?? start;
  return { start, end };
}

function buildLoadKey(stateId: string, metricIds: string[]) {
  return `${stateId}|${metricIds.join(",")}`;
}

function normalizeSeriesForChart(
  series: ChartSeries[],
  yearRange: { start: number; end: number },
  mode: NormalizationMode,
) {
  const sortedYears = Array.from(
    { length: Math.max(0, yearRange.end - yearRange.start) + 1 },
    (_, index) => yearRange.start + index,
  );

  const chartRows: ChartDataRow[] = sortedYears.map((year) => ({ year: Number(year) }));

  series.forEach((seriesItem) => {
    const pointsByYear = new Map(seriesItem.points.map((point) => [Number(point.year), point.value] as const));
    let baseValue: number | null = null;

    if (mode === "indexed") {
      const startValue = pointsByYear.get(yearRange.start);
      if (startValue !== null && startValue !== undefined && !Number.isNaN(startValue)) {
        baseValue = startValue;
      } else {
        for (const year of sortedYears) {
          const candidate = pointsByYear.get(year);
          if (candidate !== null && candidate !== undefined && !Number.isNaN(candidate)) {
            baseValue = candidate;
            break;
          }
        }
      }
    }

    chartRows.forEach((row) => {
      const rawValue = pointsByYear.get(row.year) ?? null;
      row[getRawValueKey(seriesItem.id)] = rawValue;

      if (mode === "raw") {
        row[seriesItem.id] = rawValue;
        return;
      }

      if (rawValue === null || baseValue === null || baseValue === 0) {
        row[seriesItem.id] = null;
      } else {
        row[seriesItem.id] = Number(((rawValue / baseValue) * 100).toFixed(1));
      }
    });
  });

  return chartRows;
}

function buildStateChartSeries(
  stateSeries: StateSeries[],
  selectedStateIds: string[],
  states: StateInfo[],
  selectedMetric?: MetricOption,
): ChartSeries[] {
  return selectedStateIds
    .map((stateId): ChartSeries | null => {
      const seriesEntry = stateSeries.find((item) => item.stateId === stateId);
      if (!seriesEntry) return null;
      const state = states.find((item) => item.id === stateId);
      const style = getStateSeriesStyle(stateId);

      return {
        id: stateId,
        label: state?.name ?? seriesEntry.stateName ?? stateId,
        unit: selectedMetric?.unit,
        color: style.color,
        dashArray: style.dashArray,
        rawValuesAreNonNegative: metricUsesNonnegativeRawDomain(selectedMetric?.id),
        points: seriesEntry.points,
      } satisfies ChartSeries;
    })
    .filter((item): item is ChartSeries => Boolean(item));
}

function buildMetricChartSeries(
  metricSeries: MetricSeries[],
  selectedMetricIds: string[],
  metrics: MetricOption[],
): ChartSeries[] {
  return selectedMetricIds
    .map((metricId, index): ChartSeries | null => {
      const seriesEntry = metricSeries.find((item) => item.metricId === metricId);
      const metric = metrics.find((item) => item.id === metricId);
      if (!seriesEntry || !metric) return null;
      const style = getMetricSeriesStyle(metricId, index);

      return {
        id: metricId,
        label: metric.name ?? seriesEntry.metricName,
        unit: metric.unit ?? seriesEntry.unit,
        color: style.color,
        dashArray: style.dashArray,
        rawValuesAreNonNegative: metricUsesNonnegativeRawDomain(metric.id),
        points: seriesEntry.points,
      } satisfies ChartSeries;
    })
    .filter((item): item is ChartSeries => Boolean(item));
}

function getMetricUnitKey(metric: MetricOption | undefined) {
  return metric?.unit?.trim().toLowerCase() ?? "";
}

function metricUsesNonnegativeRawDomain(metricId: string | undefined) {
  return metricId ? RAW_NONNEGATIVE_METRIC_IDS.has(metricId) : false;
}

function sanitizeStyleMap(value: unknown): SeriesStyleMap {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return Object.entries(value as Record<string, unknown>).reduce<SeriesStyleMap>((acc, [seriesId, style]) => {
    if (!style || typeof style !== "object" || Array.isArray(style)) {
      return acc;
    }

    const styleRecord = style as Record<string, unknown>;
    const nextStyle: SeriesStyle = {};
    if (typeof styleRecord.color === "string") {
      nextStyle.color = styleRecord.color;
    }
    if (typeof styleRecord.strokeDasharray === "string") {
      nextStyle.strokeDasharray = styleRecord.strokeDasharray;
    }
    if (nextStyle.color !== undefined || nextStyle.strokeDasharray !== undefined) {
      acc[seriesId] = nextStyle;
    }
    return acc;
  }, {});
}

function readStoredStyleMaps(): Record<ComparisonMode, SeriesStyleMap> {
  if (typeof window === "undefined") {
    return EMPTY_STYLE_MAPS;
  }

  try {
    const rawValue = window.localStorage.getItem(SERIES_STYLE_STORAGE_KEY);
    if (!rawValue) {
      return EMPTY_STYLE_MAPS;
    }
    const parsed = JSON.parse(rawValue) as Record<string, unknown>;
    return {
      states: sanitizeStyleMap(parsed.states),
      metrics: sanitizeStyleMap(parsed.metrics),
    };
  } catch {
    return EMPTY_STYLE_MAPS;
  }
}

function applyStyleMap(series: ChartSeries[], styleMap: SeriesStyleMap): ChartSeries[] {
  return series.map((item) => {
    const style = styleMap[item.id];
    if (!style) {
      return item;
    }

    return {
      ...item,
      color: style.color ?? item.color,
      dashArray: style.strokeDasharray ?? item.dashArray,
    };
  });
}

function getAnchorRect(element: HTMLElement): PopoverAnchorRect {
  const rect = element.getBoundingClientRect();
  return {
    bottom: rect.bottom,
    height: rect.height,
    left: rect.left,
    top: rect.top,
    width: rect.width,
  };
}

export function GraphExplorer({
  metrics,
  states,
  initialMode,
  initialMetricId,
  initialSelectedStates,
  initialSelectedStateId,
  initialSelectedMetricIds,
  availableYears: initialAvailableYears,
  initialYearRange,
  initialNormalization,
  initialStateSeries,
  initialMetricSeries,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const [comparisonMode, setComparisonMode] = useState<ComparisonMode>(initialMode);
  const [selectedMetricId, setSelectedMetricId] = useState(initialMetricId);
  const [selectedStateIds, setSelectedStateIds] = useState<string[]>(initialSelectedStates);
  const [selectedStateId, setSelectedStateId] = useState(initialSelectedStateId);
  const [selectedMetricIds, setSelectedMetricIds] = useState<string[]>(initialSelectedMetricIds);
  const [stateSearchTerm, setStateSearchTerm] = useState("");
  const [singleStateSearchTerm, setSingleStateSearchTerm] = useState("");
  const [normalization, setNormalization] = useState<NormalizationMode>(initialNormalization);
  const [normalizationForcedByUnits, setNormalizationForcedByUnits] = useState(initialNormalization === "indexed");
  const [stateAvailableYears, setStateAvailableYears] = useState<number[]>(
    initialMode === "states" ? initialAvailableYears : [],
  );
  const [metricAvailableYears, setMetricAvailableYears] = useState<number[]>(
    initialMode === "metrics" ? initialAvailableYears : [],
  );
  const [yearRange, setYearRange] = useState<{ start: number; end: number }>(initialYearRange);
  const [stateSeries, setStateSeries] = useState<StateSeries[]>(initialStateSeries);
  const [metricSeries, setMetricSeries] = useState<MetricSeries[]>(initialMetricSeries);
  const [loadedStateMetricId, setLoadedStateMetricId] = useState<string | null>(
    initialStateSeries.length ? initialMetricId : null,
  );
  const [loadedMetricKey, setLoadedMetricKey] = useState<string | null>(
    initialMetricSeries.length ? buildLoadKey(initialSelectedStateId, initialSelectedMetricIds) : null,
  );
  const [loading, setLoading] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isChartZoomed, setIsChartZoomed] = useState(false);
  const [seriesStyleMaps, setSeriesStyleMaps] =
    useState<Record<ComparisonMode, SeriesStyleMap>>(EMPTY_STYLE_MAPS);
  const [seriesStylesHydrated, setSeriesStylesHydrated] = useState(false);
  const [activeStyleEditor, setActiveStyleEditor] = useState<{
    anchorRect: PopoverAnchorRect;
    seriesId: string;
  } | null>(null);

  const selectedMetric = metrics.find((metric) => metric.id === selectedMetricId);
  const selectedState = states.find((state) => state.id === selectedStateId);
  const selectedMetricUnits = useMemo(() => {
    return new Set(
      selectedMetricIds
        .map((metricId) => getMetricUnitKey(metrics.find((metric) => metric.id === metricId)))
        .filter(Boolean),
    );
  }, [metrics, selectedMetricIds]);
  const canUseRawMetricComparison = selectedMetricIds.length > 0 && selectedMetricUnits.size === 1;
  const rawDisabled = comparisonMode === "metrics" && !canUseRawMetricComparison;
  const effectiveNormalization: NormalizationMode = rawDisabled ? "indexed" : normalization;
  const chartSeries = useMemo(() => {
    if (comparisonMode === "states") {
      return buildStateChartSeries(stateSeries, selectedStateIds, states, selectedMetric);
    }

    return buildMetricChartSeries(metricSeries, selectedMetricIds, metrics);
  }, [comparisonMode, metricSeries, metrics, selectedMetric, selectedMetricIds, selectedStateIds, stateSeries, states]);
  const currentStyleMap = useMemo(
    () => seriesStyleMaps[comparisonMode] ?? EMPTY_STYLE_MAP,
    [comparisonMode, seriesStyleMaps],
  );
  const styledChartSeries = useMemo(
    () => applyStyleMap(chartSeries, currentStyleMap),
    [chartSeries, currentStyleMap],
  );
  const chartData = useMemo(
    () => normalizeSeriesForChart(chartSeries, yearRange, effectiveNormalization),
    [chartSeries, effectiveNormalization, yearRange],
  );
  const yAxisUnit =
    effectiveNormalization === "raw"
      ? comparisonMode === "states"
        ? selectedMetric?.unit
        : metrics.find((metric) => metric.id === selectedMetricIds[0])?.unit
      : null;
  const availableYears = comparisonMode === "states" ? stateAvailableYears : metricAvailableYears;
  const legendItems = styledChartSeries.map((item) => ({
    dashArray: item.dashArray,
    id: item.id,
    name: item.label,
    color: item.color,
  }));
  const activeStyleSeries = activeStyleEditor
    ? styledChartSeries.find((item) => item.id === activeStyleEditor.seriesId) ?? null
    : null;
  const activeSeriesStyle = activeStyleEditor ? currentStyleMap[activeStyleEditor.seriesId] ?? {} : {};
  const hasActiveSeriesStyle = activeStyleEditor ? Boolean(currentStyleMap[activeStyleEditor.seriesId]) : false;
  const allStateIds = useMemo(() => states.map((state) => state.id), [states]);
  const allStatesSelected = useMemo(() => {
    if (allStateIds.length === 0) return false;
    const selected = new Set(selectedStateIds);
    return allStateIds.every((id) => selected.has(id));
  }, [allStateIds, selectedStateIds]);
  const filteredStates = useMemo(() => {
    const term = stateSearchTerm.toLowerCase();
    return states.filter(
      (state) =>
        state.name.toLowerCase().includes(term) ||
        state.abbreviation.toLowerCase().includes(term) ||
        state.id.includes(term),
    );
  }, [stateSearchTerm, states]);
  const filteredSingleStates = useMemo(() => {
    const term = singleStateSearchTerm.toLowerCase();
    return states.filter(
      (state) =>
        state.name.toLowerCase().includes(term) ||
        state.abbreviation.toLowerCase().includes(term) ||
        state.id.includes(term),
    );
  }, [singleStateSearchTerm, states]);
  const groupedMetrics = useMemo(() => {
    return METRIC_GROUP_ORDER.map((group) => ({
      group,
      metrics: metrics.filter((metric) => getMetricGroup(metric.id) === group),
    })).filter((group) => group.metrics.length > 0);
  }, [metrics]);
  const chartTitle =
    comparisonMode === "states"
      ? `State comparison${selectedMetric?.name ? `: ${selectedMetric.name}` : ""}`
      : `${selectedState?.name ?? "Selected state"}: metric comparison`;
  const chartSubtitle =
    effectiveNormalization === "raw"
      ? yAxisUnit
        ? `Unit: ${yAxisUnit} · Raw values`
        : "Raw values"
      : "Indexed to start year";
  const chartInstanceKey = [
    comparisonMode,
    selectedMetricId,
    selectedStateId,
    selectedStateIds.join(","),
    selectedMetricIds.join(","),
    effectiveNormalization,
    yearRange.start,
    yearRange.end,
    chartData[0]?.year ?? "none",
    chartData[chartData.length - 1]?.year ?? "none",
  ].join("|");

  useEffect(() => {
    if (!isUpdating) return;
    const timeout = setTimeout(() => setIsUpdating(false), 250);
    return () => clearTimeout(timeout);
  }, [isUpdating]);

  useEffect(() => {
    setSeriesStyleMaps(readStoredStyleMaps());
    setSeriesStylesHydrated(true);
  }, []);

  useEffect(() => {
    if (!seriesStylesHydrated || typeof window === "undefined") return;

    try {
      window.localStorage.setItem(SERIES_STYLE_STORAGE_KEY, JSON.stringify(seriesStyleMaps));
    } catch {
      // localStorage can be unavailable in private or restricted browsing contexts.
    }
  }, [seriesStyleMaps, seriesStylesHydrated]);

  useEffect(() => {
    setActiveStyleEditor(null);
  }, [comparisonMode]);

  useEffect(() => {
    if (!activeStyleEditor) return;
    if (!styledChartSeries.some((item) => item.id === activeStyleEditor.seriesId)) {
      setActiveStyleEditor(null);
    }
  }, [activeStyleEditor, styledChartSeries]);

  useEffect(() => {
    if (availableYears.length === 0) return;
    setYearRange((prev) => {
      const start = availableYears.includes(prev.start) ? prev.start : availableYears[0];
      const end = availableYears.includes(prev.end) ? prev.end : availableYears[availableYears.length - 1];
      return start <= end
        ? { start, end }
        : { start: availableYears[0], end: availableYears[availableYears.length - 1] };
    });
  }, [availableYears]);

  useEffect(() => {
    if (comparisonMode !== "metrics") {
      setNormalizationForcedByUnits(false);
      return;
    }

    if (!canUseRawMetricComparison) {
      if (normalization !== "indexed") {
        setNormalization("indexed");
      }
      setNormalizationForcedByUnits(true);
      return;
    }

    if (normalizationForcedByUnits) {
      setNormalization("raw");
      setNormalizationForcedByUnits(false);
    }
  }, [canUseRawMetricComparison, comparisonMode, normalization, normalizationForcedByUnits]);

  useEffect(() => {
    if (comparisonMode !== "states") return;
    if (!selectedMetricId || selectedMetricId === loadedStateMetricId) return;

    async function fetchMetricData(metricId: string) {
      setLoading(true);
      try {
        const res = await fetch(`/api/graph-data?metric=${encodeURIComponent(metricId)}`);
        if (!res.ok) throw new Error(`Failed to load metric data (${res.status})`);
        const json: StateGraphResponse = await res.json();
        const years = json.availableYears ?? [];
        setStateAvailableYears(years);
        setStateSeries(json.series ?? []);
        setLoadedStateMetricId(metricId);
        if (years.length > 0) {
          setYearRange(getYearRangeFromYears(years));
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }

    fetchMetricData(selectedMetricId);
  }, [comparisonMode, loadedStateMetricId, selectedMetricId]);

  useEffect(() => {
    if (comparisonMode !== "metrics") return;
    if (selectedMetricIds.length === 0) {
      setMetricSeries([]);
      setMetricAvailableYears([]);
      setLoadedMetricKey(null);
      return;
    }

    const nextLoadKey = buildLoadKey(selectedStateId, selectedMetricIds);
    if (nextLoadKey === loadedMetricKey) return;

    async function fetchMetricComparisonData() {
      setLoading(true);
      try {
        const params = new URLSearchParams({
          mode: "metrics",
          state: selectedStateId,
          metrics: selectedMetricIds.join(","),
        });
        const res = await fetch(`/api/graph-data?${params.toString()}`);
        if (!res.ok) throw new Error(`Failed to load metric comparison data (${res.status})`);
        const json: MetricGraphResponse = await res.json();
        const years = json.availableYears ?? [];
        setMetricAvailableYears(years);
        setMetricSeries(json.series ?? []);
        setLoadedMetricKey(nextLoadKey);
        if (years.length > 0) {
          setYearRange(getYearRangeFromYears(years));
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }

    fetchMetricComparisonData();
  }, [comparisonMode, loadedMetricKey, selectedMetricIds, selectedStateId]);

  useEffect(() => {
    const params = new URLSearchParams();
    params.set("mode", comparisonMode);
    params.set("normalization", effectiveNormalization);
    params.set("startYear", String(yearRange.start));
    params.set("endYear", String(yearRange.end));

    if (comparisonMode === "states") {
      params.set("metric", selectedMetricId);
      params.set(
        "states",
        selectedStateIds
          .map((stateId) => states.find((state) => state.id === stateId)?.abbreviation ?? stateId)
          .join(","),
      );
    } else {
      params.set("state", states.find((state) => state.id === selectedStateId)?.abbreviation ?? selectedStateId);
      params.set("metrics", selectedMetricIds.join(","));
    }

    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }, [
    comparisonMode,
    effectiveNormalization,
    pathname,
    router,
    selectedMetricId,
    selectedMetricIds,
    selectedStateId,
    selectedStateIds,
    states,
    yearRange.end,
    yearRange.start,
  ]);

  const setMode = (nextMode: ComparisonMode) => {
    setComparisonMode(nextMode);
    setIsChartZoomed(false);
    if (nextMode === "metrics") {
      setNormalization(canUseRawMetricComparison ? "raw" : "indexed");
      setNormalizationForcedByUnits(!canUseRawMetricComparison);
    } else {
      setNormalization("raw");
      setNormalizationForcedByUnits(false);
    }
  };

  const toggleSelectAllStates = () => {
    setIsUpdating(true);
    setSelectedStateIds(allStatesSelected ? [] : allStateIds);
  };

  const toggleMetric = (metricId: string, checked: boolean) => {
    setIsUpdating(true);
    setSelectedMetricIds((prev) => {
      if (checked) {
        return Array.from(new Set([...prev, metricId]));
      }
      return prev.filter((id) => id !== metricId);
    });
  };

  const setYearRangeStart = (next: number) => {
    setIsUpdating(true);
    setYearRange((prev) => ({
      start: Math.min(next, prev.end),
      end: prev.end,
    }));
  };

  const setYearRangeEnd = (next: number) => {
    setIsUpdating(true);
    setYearRange((prev) => ({
      start: prev.start,
      end: Math.max(next, prev.start),
    }));
  };

  const updateSeriesStyle = useCallback(
    (seriesId: string, patch: SeriesStyle) => {
      setSeriesStyleMaps((prev) => {
        const modeStyleMap = prev[comparisonMode] ?? {};
        const currentStyle = modeStyleMap[seriesId] ?? {};
        const nextStyle: SeriesStyle = {
          ...currentStyle,
          ...patch,
        };

        return {
          ...prev,
          [comparisonMode]: {
            ...modeStyleMap,
            [seriesId]: nextStyle,
          },
        };
      });
    },
    [comparisonMode],
  );

  const resetSeriesStyle = useCallback(
    (seriesId: string) => {
      setSeriesStyleMaps((prev) => {
        const modeStyleMap = prev[comparisonMode] ?? {};
        if (!modeStyleMap[seriesId]) {
          return prev;
        }

        const nextModeStyleMap = { ...modeStyleMap };
        delete nextModeStyleMap[seriesId];
        return {
          ...prev,
          [comparisonMode]: nextModeStyleMap,
        };
      });
    },
    [comparisonMode],
  );

  const openSeriesStyleEditor = (seriesId: string, triggerElement: HTMLElement) => {
    setActiveStyleEditor((prev) => {
      if (prev?.seriesId === seriesId) {
        return null;
      }

      return {
        anchorRect: getAnchorRect(triggerElement),
        seriesId,
      };
    });
  };

  const renderModeToggle = () => (
    <div className="space-y-2">
      <p className="text-sm font-medium text-slate-700">Comparison</p>
      <div className="grid grid-cols-2 rounded-xl border border-slate-200 bg-slate-100 p-1 text-left text-xs">
        {([
          { id: "states", label: "Compare States", description: "One metric across multiple states." },
          { id: "metrics", label: "Compare Metrics", description: "One state across multiple metrics." },
        ] as const).map((mode) => {
          const active = comparisonMode === mode.id;
          return (
            <button
              key={mode.id}
              type="button"
              onClick={() => setMode(mode.id)}
              aria-pressed={active}
              className={`rounded-lg px-2.5 py-2 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/60 ${
                active ? "bg-white text-slate-950 shadow-sm" : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <span className="block text-[12px] font-semibold">{mode.label}</span>
              <span className="mt-0.5 block text-[10px] leading-tight text-slate-500">{mode.description}</span>
            </button>
          );
        })}
      </div>
    </div>
  );

  return (
    <div className="grid h-full min-h-full gap-4 lg:grid-cols-[320px_1fr]">
      <div className="h-auto min-h-fit space-y-5 overflow-visible rounded-3xl border border-slate-200 bg-white p-5 shadow-sm md:space-y-4 md:rounded-2xl md:p-4">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Controls</p>
          <h2 className="text-lg font-semibold text-slate-900">
            {comparisonMode === "states" ? "Metric & States" : "State & Metrics"}
          </h2>
        </div>

        {renderModeToggle()}

        {comparisonMode === "states" ? (
          <>
            <div className="space-y-2">
              <MetricSelect metrics={metrics} value={selectedMetricId} onChange={setSelectedMetricId} className="w-full" />
              {selectedMetric?.description ? (
                <p className="text-xs text-slate-500">{selectedMetric.description}</p>
              ) : null}
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <label className="text-sm font-medium text-slate-700" htmlFor="state-filter">
                  States
                </label>
                <button
                  type="button"
                  onClick={toggleSelectAllStates}
                  className="inline-flex items-center rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-600 shadow-sm transition hover:bg-slate-50 hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/60"
                  aria-pressed={allStatesSelected}
                >
                  {allStatesSelected ? "Clear all" : "Select all"}
                </button>
                <span className="text-xs text-slate-500">{selectedStateIds.length} selected</span>
              </div>
              <input
                id="state-filter"
                type="text"
                placeholder="Search states"
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm shadow-inner focus:border-slate-400 focus:outline-none"
                value={stateSearchTerm}
                onChange={(event) => setStateSearchTerm(event.target.value)}
              />
              <div className="max-h-[320px] space-y-1 overflow-y-auto rounded-lg border border-slate-100 bg-slate-50 p-2 md:max-h-56" role="listbox" aria-label="Select states">
                {filteredStates.map((state) => {
                  const checked = selectedStateIds.includes(state.id);
                  return (
                    <label key={state.id} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 hover:bg-white">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(event) => {
                          setIsUpdating(true);
                          if (event.target.checked) {
                            setSelectedStateIds((prev) => Array.from(new Set([...prev, state.id])));
                          } else {
                            setSelectedStateIds((prev) => prev.filter((id) => id !== state.id));
                          }
                        }}
                        className="accent-slate-700"
                      />
                      <span className="text-sm text-slate-800">
                        {state.name} ({state.abbreviation})
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700" htmlFor="single-state-filter">
                State
              </label>
              <input
                id="single-state-filter"
                type="text"
                placeholder="Search states"
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm shadow-inner focus:border-slate-400 focus:outline-none"
                value={singleStateSearchTerm}
                onChange={(event) => setSingleStateSearchTerm(event.target.value)}
              />
              <div className="max-h-52 space-y-1 overflow-y-auto rounded-lg border border-slate-100 bg-slate-50 p-2" role="listbox" aria-label="Select one state">
                {filteredSingleStates.map((state) => {
                  const checked = selectedStateId === state.id;
                  return (
                    <button
                      key={state.id}
                      type="button"
                      role="option"
                      aria-selected={checked}
                      onClick={() => {
                        setSelectedStateId(state.id);
                        setIsUpdating(true);
                      }}
                      className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm transition ${
                        checked ? "bg-white font-semibold text-slate-950 shadow-sm" : "text-slate-800 hover:bg-white"
                      }`}
                    >
                      <span>
                        {state.name} ({state.abbreviation})
                      </span>
                      {checked ? <span className="h-2 w-2 rounded-full bg-slate-800" aria-hidden /> : null}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-slate-700">Metrics</p>
                <span className="text-xs text-slate-500">{selectedMetricIds.length} selected</span>
              </div>
              <div className="max-h-[320px] space-y-2 overflow-y-auto rounded-lg border border-slate-100 bg-slate-50 p-2 md:max-h-60" role="group" aria-label="Select metrics">
                {groupedMetrics.map((group) => (
                  <div key={group.group} className="space-y-1">
                    <p className="px-2 pt-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">
                      {group.group}
                    </p>
                    {group.metrics.map((metric) => {
                      const checked = selectedMetricIds.includes(metric.id);
                      return (
                        <label key={metric.id} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 hover:bg-white">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(event) => toggleMetric(metric.id, event.target.checked)}
                            className="accent-slate-700"
                          />
                          <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white text-slate-600">
                            {getMetricIcon(metric.id, "h-4 w-4")}
                          </span>
                          <span className="min-w-0">
                            <span className="block truncate text-sm text-slate-800">{metric.name}</span>
                            <span className="block text-xs text-slate-500">{metric.unit ?? "Unit n/a"}</span>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        <div className="space-y-3">
          <p className="text-sm font-medium text-slate-700">Year range</p>
          <div className="flex items-center gap-3 text-xs text-slate-600">
            <span>{availableYears[0] ?? "–"}</span>
            <input
              type="range"
              min={availableYears[0] ?? 0}
              max={availableYears[availableYears.length - 1] ?? 0}
              value={yearRange.start}
              onChange={(event) => setYearRangeStart(Number(event.target.value))}
              className="w-full accent-slate-700"
              step={1}
              aria-label="Start year"
              onMouseUp={() => setIsUpdating(true)}
              onTouchEnd={() => setIsUpdating(true)}
              disabled={!availableYears.length}
            />
            <input
              type="range"
              min={availableYears[0] ?? 0}
              max={availableYears[availableYears.length - 1] ?? 0}
              value={yearRange.end}
              onChange={(event) => setYearRangeEnd(Number(event.target.value))}
              className="w-full accent-slate-700"
              step={1}
              aria-label="End year"
              onMouseUp={() => setIsUpdating(true)}
              onTouchEnd={() => setIsUpdating(true)}
              disabled={!availableYears.length}
            />
            <span>{availableYears[availableYears.length - 1] ?? "–"}</span>
          </div>
          <div className="flex items-center justify-between text-xs text-slate-600">
            <span>Start: {yearRange.start}</span>
            <span>End: {yearRange.end}</span>
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium text-slate-700">Normalization</p>
          <div className="inline-flex rounded-lg border border-slate-200 bg-slate-100 p-1 text-sm">
            {(["raw", "indexed"] as const).map((mode) => {
              const disabled = mode === "raw" && rawDisabled;
              return (
                <button
                  key={mode}
                  type="button"
                  onClick={() => {
                    if (disabled) return;
                    setNormalization(mode);
                    setNormalizationForcedByUnits(false);
                  }}
                  aria-pressed={effectiveNormalization === mode}
                  disabled={disabled}
                  title={disabled ? "Raw values are disabled when comparing metrics with different units." : undefined}
                  className={`rounded-md px-3 py-1 font-medium transition disabled:cursor-not-allowed disabled:opacity-45 ${
                    effectiveNormalization === mode
                      ? "bg-white text-slate-900 shadow-sm"
                      : "text-slate-600 hover:text-slate-800"
                  }`}
                >
                  {mode === "raw" ? "Raw values" : "Indexed (100 = start)"}
                </button>
              );
            })}
          </div>
          {rawDisabled ? (
            <p className="text-xs leading-relaxed text-slate-500">
              Raw values are disabled when comparing metrics with different units.
            </p>
          ) : null}
        </div>
      </div>

      <div className="flex min-h-[560px] flex-col rounded-3xl border border-slate-200 bg-white p-4 pb-3 shadow-sm md:min-h-0 md:rounded-2xl">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Chart</p>
            <h2 className="text-[26px] font-semibold leading-tight text-slate-900 md:text-xl">{chartTitle}</h2>
            <p className="text-xs text-slate-500">{chartSubtitle}</p>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 md:justify-end" aria-live="polite">
            {!isChartZoomed && chartSeries.length > 0 && chartData.length > 0 ? (
              <span className="hidden items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-500 shadow-sm sm:inline-flex">
                <MousePointer2 className="h-3.5 w-3.5" aria-hidden />
                <span>Scroll to zoom</span>
              </span>
            ) : null}
            {loading ? <span>Loading data…</span> : null}
            {isUpdating && !loading ? <span className="rounded-full bg-amber-100 px-2 py-1 text-amber-800">Updating…</span> : null}
          </div>
        </div>

        {chartSeries.length === 0 ? (
          <div className="mt-6 rounded-lg border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-600">
            {loading
              ? "Loading chart data..."
              : comparisonMode === "states"
                ? "Select at least one state to view the chart."
                : "Select at least one metric to view the chart."}
          </div>
        ) : chartData.length === 0 ? (
          <div className="mt-6 rounded-lg border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-600">
            No data available for this comparison.
          </div>
        ) : (
          <div className="mt-3 h-[460px] w-full min-w-0 flex-1 sm:h-[500px] md:mt-4 md:h-auto md:min-h-[520px] lg:min-h-[540px] xl:min-h-[560px]">
            <ChartContainer
              key={chartInstanceKey}
              chartData={chartData}
              series={styledChartSeries}
              yAxisUnit={yAxisUnit}
              normalization={effectiveNormalization}
              onZoomChange={setIsChartZoomed}
            />
          </div>
        )}

        {legendItems.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-2.5 text-xs text-slate-700">
            {legendItems.map((item) => (
              <button
                key={item.id}
                type="button"
                aria-haspopup="dialog"
                aria-expanded={activeStyleEditor?.seriesId === item.id}
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => openSeriesStyleEditor(item.id, event.currentTarget)}
                className={`inline-flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1 text-left shadow-sm transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/60 active:translate-y-0 active:shadow-sm ${
                  activeStyleEditor?.seriesId === item.id
                    ? "border-slate-400 bg-slate-100 text-slate-950 shadow-md"
                    : "border-slate-200 bg-white hover:-translate-y-0.5 hover:border-slate-300 hover:bg-slate-50 hover:text-slate-950 hover:shadow-md"
                }`}
              >
                <svg className="h-3.5 w-8 shrink-0" viewBox="0 0 32 14" aria-hidden>
                  <line
                    x1="2"
                    y1="7"
                    x2="30"
                    y2="7"
                    stroke={item.color}
                    strokeDasharray={item.dashArray || undefined}
                    strokeLinecap="round"
                    strokeWidth="3"
                  />
                </svg>
                <span>{item.name}</span>
              </button>
            ))}
          </div>
        ) : null}

        {activeStyleEditor && activeStyleSeries ? (
          <SeriesStylePopover
            anchorRect={activeStyleEditor.anchorRect}
            hasCustomStyle={hasActiveSeriesStyle}
            series={activeStyleSeries}
            style={activeSeriesStyle}
            onChange={(patch) => updateSeriesStyle(activeStyleEditor.seriesId, patch)}
            onClose={() => setActiveStyleEditor(null)}
            onReset={() => resetSeriesStyle(activeStyleEditor.seriesId)}
          />
        ) : null}
      </div>
    </div>
  );
}
