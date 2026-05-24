"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type WheelEvent } from "react";
import { RotateCcw } from "lucide-react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatMetricValue } from "@/lib/format";
import { TooltipContent } from "./TooltipContent";
import type { ChartDataRow, ChartSeries, NormalizationMode } from "./chartTypes";
import { getRawValueKey } from "./chartTypes";

type Props = {
  chartData: ChartDataRow[];
  series: ChartSeries[];
  normalization: NormalizationMode;
  yAxisUnit?: string | null;
  onZoomChange?: (isZoomed: boolean) => void;
};

type ZoomWindow = {
  startIndex: number;
  endIndex: number;
};

type PanSession = {
  initialEndIndex: number;
  initialStartIndex: number;
  pointerId: number;
  startClientX: number;
};

type LockedInspection = {
  pointerId: number;
  seriesId: string;
  tooltipX: number;
  tooltipY: number;
  value: number | null;
  rawValue: number | null;
  year: number;
};

type LockedDotProps = {
  cx?: number;
  cy?: number;
  payload?: ChartDataRow;
};

const MIN_VISIBLE_POINTS = 3;
const ZOOM_IN_MULTIPLIER = 0.88;
const ZOOM_OUT_MULTIPLIER = 1.14;

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function buildYearTicks(startYear: number, endYear: number, chartWidth: number) {
  if (!Number.isFinite(startYear) || !Number.isFinite(endYear)) return [];
  if (endYear < startYear) return [];
  if (startYear === endYear) return [startYear];

  const totalYears = endYear - startYear + 1;
  if (totalYears <= 12) {
    return Array.from({ length: totalYears }, (_, index) => startYear + index);
  }

  const safeWidth = chartWidth > 0 ? chartWidth : 720;
  const maxLabels = Math.max(2, Math.floor(safeWidth / 84));
  const candidateSteps = totalYears <= 25 ? [1, 2, 5] : [1, 2, 5, 10];
  const step =
    candidateSteps.find((candidate) => Math.ceil(totalYears / candidate) <= maxLabels) ??
    Math.max(1, Math.ceil(totalYears / maxLabels));

  const ticks: number[] = [startYear];
  for (let year = startYear + step; year < endYear; year += step) {
    ticks.push(year);
  }
  if (ticks[ticks.length - 1] !== endYear) {
    ticks.push(endYear);
  }

  return ticks;
}

function getVisibleYDomain(visibleData: ChartDataRow[], seriesIds: string[]) {
  const values = visibleData.flatMap((row) =>
    seriesIds
      .map((seriesId) => row[seriesId])
      .filter((value): value is number => typeof value === "number" && Number.isFinite(value)),
  );

  if (values.length === 0) return [0, 1] as const;

  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const span = maxValue - minValue;
  const padding = span === 0 ? Math.max(1, Math.abs(maxValue) * 0.08) : span * 0.08;

  return [minValue - padding, maxValue + padding] as const;
}

function getYAxisWidth(
  yDomain: readonly [number, number],
  yAxisUnit: string | null | undefined,
  normalization: NormalizationMode,
  isMobileChart: boolean,
) {
  const [domainMin, domainMax] = yDomain;
  const candidates = [domainMin, (domainMin + domainMax) / 2, domainMax];
  const longestLabelLength = Math.max(
    ...candidates.map((value) =>
      formatMetricValue(value, yAxisUnit ?? undefined, {
        compact: true,
        mode: normalization,
      }).length,
    ),
  );

  if (isMobileChart) {
    return Math.min(72, Math.max(46, longestLabelLength * 7 + 8));
  }

  return Math.min(118, Math.max(58, longestLabelLength * 8 + 16));
}

export default function GraphInner({
  chartData,
  series,
  normalization,
  yAxisUnit,
  onZoomChange,
}: Props) {
  const chartAreaRef = useRef<HTMLDivElement | null>(null);
  const panSessionRef = useRef<PanSession | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const [hoveredSeriesId, setHoveredSeriesId] = useState<string | null>(null);
  const [lockedInspection, setLockedInspection] = useState<LockedInspection | null>(null);
  const [isPanning, setIsPanning] = useState(false);
  const [chartWidth, setChartWidth] = useState(0);
  const [zoomWindow, setZoomWindow] = useState<ZoomWindow>({
    startIndex: 0,
    endIndex: Math.max(0, chartData.length - 1),
  });

  const maxIndex = Math.max(0, chartData.length - 1);
  const visibleStartIndex = clamp(zoomWindow.startIndex, 0, maxIndex);
  const visibleEndIndex = clamp(zoomWindow.endIndex, visibleStartIndex, maxIndex);
  const visibleData = useMemo(
    () => chartData.slice(visibleStartIndex, visibleEndIndex + 1),
    [chartData, visibleEndIndex, visibleStartIndex],
  );
  const setChartAreaNode = useCallback((node: HTMLDivElement | null) => {
    resizeObserverRef.current?.disconnect();
    resizeObserverRef.current = null;
    chartAreaRef.current = node;

    if (!node) {
      setChartWidth(0);
      return;
    }

    const updateWidth = (nextWidth: number) => {
      const roundedWidth = Math.round(nextWidth);
      setChartWidth((previous) => (previous === roundedWidth ? previous : roundedWidth));
    };

    updateWidth(node.clientWidth);

    const observer = new ResizeObserver((entries) => {
      const nextWidth = entries[0]?.contentRect.width ?? node.clientWidth;
      updateWidth(nextWidth);
    });
    observer.observe(node);
    resizeObserverRef.current = observer;
  }, []);

  const seriesIds = useMemo(() => series.map((item) => item.id), [series]);
  const seriesById = useMemo(() => new Map(series.map((item) => [item.id, item])), [series]);
  const isZoomed = visibleStartIndex !== 0 || visibleEndIndex !== maxIndex;
  const visibleStartYear = visibleData[0]?.year ?? 0;
  const visibleEndYear = visibleData[visibleData.length - 1]?.year ?? visibleStartYear;
  const isMobileChart = chartWidth > 0 && chartWidth < 640;
  const chartMargin = isMobileChart
    ? { left: 0, right: 4, top: 12, bottom: 4 }
    : { left: 4, right: 14, top: 16, bottom: 8 };
  const axisTickFontSize = isMobileChart ? 11 : 12;
  const yAxisTickMargin = isMobileChart ? 4 : 10;
  const visibleRangeLabel = visibleData.length > 0 ? `${visibleStartYear}\u2013${visibleEndYear}` : null;
  const yDomain = useMemo(
    () => getVisibleYDomain(visibleData, seriesIds),
    [seriesIds, visibleData],
  );
  const yAxisWidth = useMemo(
    () => getYAxisWidth(yDomain, yAxisUnit, normalization, isMobileChart),
    [isMobileChart, normalization, yAxisUnit, yDomain],
  );
  const yAxisTickFormatter = useMemo(
    () => (value: number) =>
      formatMetricValue(value, yAxisUnit ?? undefined, {
        compact: true,
        mode: normalization,
      }),
    [normalization, yAxisUnit],
  );
  const xAxisTickFormatter = useCallback((value: number) => `${Math.round(Number(value))}`, []);
  const baseStrokeWidth = series.length >= 24 ? 1.7 : 2;
  const interactionStrokeWidth = 14;
  const yearTicks = useMemo(
    () => buildYearTicks(visibleStartYear, visibleEndYear, chartWidth),
    [chartWidth, visibleEndYear, visibleStartYear],
  );
  const verticalGridCoordinatesGenerator = useCallback(
    ({ offset }: { offset?: { left?: number; width?: number } }) => {
      if (visibleEndYear < visibleStartYear) {
        return [];
      }

      const left = offset?.left ?? 0;
      const width = offset?.width ?? 0;
      if (width <= 0) {
        return [];
      }

      const span = visibleEndYear - visibleStartYear;
      if (span === 0) {
        return [left];
      }

      return Array.from({ length: span + 1 }, (_, index) => left + (width * index) / span);
    },
    [visibleEndYear, visibleStartYear],
  );
  const getNearestInspectionPoint = useCallback(
    (seriesId: string, clientX: number): Omit<LockedInspection, "pointerId" | "seriesId"> | null => {
      const chartElement = chartAreaRef.current;
      if (!chartElement || !visibleData.length) return null;

      const rect = chartElement.getBoundingClientRect();
      const plotLeft = yAxisWidth + chartMargin.left;
      const plotRight = Math.max(plotLeft + 1, rect.width - chartMargin.right);
      const plotWidth = plotRight - plotLeft;
      const relativeX = clamp((clientX - rect.left - plotLeft) / plotWidth, 0, 1);
      const targetYear = visibleStartYear + relativeX * Math.max(visibleEndYear - visibleStartYear, 1);
      const nearestRow = visibleData.reduce((nearest, row) => {
        return Math.abs(row.year - targetYear) < Math.abs(nearest.year - targetYear) ? row : nearest;
      }, visibleData[0]);
      const nearestRelativeX =
        visibleEndYear === visibleStartYear
          ? 0
          : clamp((nearestRow.year - visibleStartYear) / (visibleEndYear - visibleStartYear), 0, 1);
      const tooltipWidth = isMobileChart ? 224 : 240;
      const tooltipHeight = 130;
      const value = nearestRow[seriesId];
      const rawValue = nearestRow[getRawValueKey(seriesId)];
      const [domainMin, domainMax] = yDomain;
      const usableHeight = Math.max(80, rect.height - chartMargin.top - chartMargin.bottom - 34);
      const valueRatio =
        typeof value === "number" && Number.isFinite(value) && domainMax !== domainMin
          ? clamp((domainMax - value) / (domainMax - domainMin), 0, 1)
          : 0.35;
      const pointX = plotLeft + nearestRelativeX * plotWidth;
      const pointY = chartMargin.top + valueRatio * usableHeight;

      return {
        year: nearestRow.year,
        value: typeof value === "number" && Number.isFinite(value) ? value : null,
        rawValue: typeof rawValue === "number" && Number.isFinite(rawValue) ? rawValue : null,
        tooltipX: clamp(pointX + 14, 8, Math.max(8, rect.width - tooltipWidth - 8)),
        tooltipY: clamp(pointY - tooltipHeight - 10, 8, Math.max(8, rect.height - tooltipHeight - 8)),
      };
    },
    [
      chartMargin.bottom,
      chartMargin.left,
      chartMargin.right,
      chartMargin.top,
      isMobileChart,
      visibleData,
      visibleEndYear,
      visibleStartYear,
      yAxisWidth,
      yDomain,
    ],
  );
  const startLineInspection = useCallback(
    (seriesId: string, event: ReactPointerEvent<Element>) => {
      if (event.button !== 0 || event.pointerType !== "mouse") return;
      const inspectionPoint = getNearestInspectionPoint(seriesId, event.clientX);
      if (!inspectionPoint || !chartAreaRef.current) return;

      event.preventDefault();
      event.stopPropagation();
      chartAreaRef.current.setPointerCapture(event.pointerId);
      setHoveredSeriesId(seriesId);
      setLockedInspection({
        ...inspectionPoint,
        pointerId: event.pointerId,
        seriesId,
      });
    },
    [getNearestInspectionPoint],
  );

  const handleResetZoom = useCallback(() => {
    setZoomWindow({
      startIndex: 0,
      endIndex: Math.max(0, chartData.length - 1),
    });
  }, [chartData.length]);

  const handleWheelZoom = useCallback(
    (event: WheelEvent<HTMLDivElement>) => {
      if (lockedInspection) return;
      if (!chartAreaRef.current || chartData.length <= MIN_VISIBLE_POINTS) return;

      event.preventDefault();

      const rect = chartAreaRef.current.getBoundingClientRect();
      const relativeX = clamp((event.clientX - rect.left) / Math.max(rect.width, 1), 0, 1);

      setZoomWindow((previous) => {
        const currentStart = clamp(previous.startIndex, 0, maxIndex);
        const currentEnd = clamp(previous.endIndex, currentStart, maxIndex);
        const currentVisiblePoints = currentEnd - currentStart + 1;

        const isZoomingIn = event.deltaY < 0;
        let nextVisiblePoints = isZoomingIn
          ? Math.floor(currentVisiblePoints * ZOOM_IN_MULTIPLIER)
          : Math.ceil(currentVisiblePoints * ZOOM_OUT_MULTIPLIER);

        if (nextVisiblePoints === currentVisiblePoints) {
          nextVisiblePoints = currentVisiblePoints + (isZoomingIn ? -1 : 1);
        }

        nextVisiblePoints = clamp(nextVisiblePoints, MIN_VISIBLE_POINTS, chartData.length);

        if (nextVisiblePoints === currentVisiblePoints) {
          return previous;
        }

        const anchorIndex = currentStart + relativeX * Math.max(currentVisiblePoints - 1, 1);
        let nextStart = Math.round(anchorIndex - relativeX * Math.max(nextVisiblePoints - 1, 1));
        nextStart = clamp(nextStart, 0, Math.max(0, chartData.length - nextVisiblePoints));
        const nextEnd = nextStart + nextVisiblePoints - 1;

        if (nextStart === currentStart && nextEnd === currentEnd) {
          return previous;
        }

        return { startIndex: nextStart, endIndex: nextEnd };
      });
    },
    [chartData.length, lockedInspection, maxIndex],
  );

  const hideHoverTooltip = useCallback(() => {
    if (lockedInspection) return;
    setHoveredSeriesId(null);
  }, [lockedInspection]);

  const endPan = useCallback((pointerId?: number) => {
    const session = panSessionRef.current;
    if (!session) return;

    if (pointerId !== undefined && session.pointerId !== pointerId) {
      return;
    }

    if (chartAreaRef.current?.hasPointerCapture(session.pointerId)) {
      chartAreaRef.current.releasePointerCapture(session.pointerId);
    }

    panSessionRef.current = null;
    setIsPanning(false);
  }, []);

  const endLineInspection = useCallback(
    (pointerId?: number) => {
      if (!lockedInspection) return false;
      if (pointerId !== undefined && lockedInspection.pointerId !== pointerId) return false;

      if (chartAreaRef.current?.hasPointerCapture(lockedInspection.pointerId)) {
        chartAreaRef.current.releasePointerCapture(lockedInspection.pointerId);
      }

      setLockedInspection(null);
      return true;
    },
    [lockedInspection],
  );

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (hoveredSeriesId) {
        startLineInspection(hoveredSeriesId, event);
        return;
      }
      if (!isZoomed || event.button !== 0 || event.pointerType !== "mouse") return;
      if (!chartAreaRef.current) return;

      event.preventDefault();

      const currentStart = clamp(zoomWindow.startIndex, 0, maxIndex);
      const currentEnd = clamp(zoomWindow.endIndex, currentStart, maxIndex);

      panSessionRef.current = {
        initialEndIndex: currentEnd,
        initialStartIndex: currentStart,
        pointerId: event.pointerId,
        startClientX: event.clientX,
      };

      chartAreaRef.current.setPointerCapture(event.pointerId);
      setIsPanning(true);
      hideHoverTooltip();
    },
    [hideHoverTooltip, hoveredSeriesId, isZoomed, maxIndex, startLineInspection, zoomWindow.endIndex, zoomWindow.startIndex],
  );

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (lockedInspection?.pointerId === event.pointerId) {
        const inspectionPoint = getNearestInspectionPoint(lockedInspection.seriesId, event.clientX);
        if (!inspectionPoint) return;

        event.preventDefault();
        setHoveredSeriesId(lockedInspection.seriesId);
        setLockedInspection((previous) => {
          if (!previous || previous.pointerId !== event.pointerId) return previous;
          return {
            ...previous,
            ...inspectionPoint,
          };
        });
        return;
      }

      const session = panSessionRef.current;
      if (!session || session.pointerId !== event.pointerId || !chartAreaRef.current) return;

      event.preventDefault();

      const chartWidth = Math.max(chartAreaRef.current.clientWidth, 1);
      const visiblePoints = session.initialEndIndex - session.initialStartIndex + 1;
      const deltaX = event.clientX - session.startClientX;
      const offsetPoints = Math.round((deltaX / chartWidth) * Math.max(visiblePoints - 1, 1));

      const nextStart = clamp(
        session.initialStartIndex - offsetPoints,
        0,
        Math.max(0, chartData.length - visiblePoints),
      );
      const nextEnd = nextStart + visiblePoints - 1;

      setZoomWindow((previous) => {
        if (previous.startIndex === nextStart && previous.endIndex === nextEnd) {
          return previous;
        }

        return { startIndex: nextStart, endIndex: nextEnd };
      });
    },
    [chartData.length, getNearestInspectionPoint, lockedInspection],
  );

  const handlePointerUp = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (endLineInspection(event.pointerId)) return;
      endPan(event.pointerId);
    },
    [endLineInspection, endPan],
  );

  useEffect(() => {
    onZoomChange?.(isZoomed);
  }, [isZoomed, onZoomChange]);

  useEffect(() => {
    if (!lockedInspection) return;
    const previousUserSelect = document.body.style.userSelect;
    document.body.style.userSelect = "none";
    return () => {
      document.body.style.userSelect = previousUserSelect;
    };
  }, [lockedInspection]);

  useEffect(() => {
    return () => {
      resizeObserverRef.current?.disconnect();
    };
  }, []);

  const activeSeriesId = lockedInspection?.seriesId ?? hoveredSeriesId;
  const lockedSeries = lockedInspection ? seriesById.get(lockedInspection.seriesId) : null;

  return (
    <div
      ref={setChartAreaNode}
      className={`relative h-full w-full ${
        lockedInspection
          ? "cursor-ew-resize select-none [&_*]:cursor-ew-resize [&_*]:select-none"
          : isZoomed
            ? isPanning
              ? "cursor-grabbing select-none [&_*]:cursor-grabbing"
              : "cursor-grab [&_*]:cursor-grab"
            : ""
      }`}
      onWheel={handleWheelZoom}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      {isZoomed ? (
        <div className="pointer-events-none absolute right-3 top-3 z-10 flex flex-wrap items-center justify-end gap-2">
          {visibleRangeLabel ? (
            <span className="inline-flex items-center rounded-full border border-slate-200 bg-white/90 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-600 shadow-sm backdrop-blur-sm">
              Zoomed: {visibleRangeLabel}
            </span>
          ) : null}
          <button
            type="button"
            onClick={handleResetZoom}
            onPointerDown={(event) => {
              event.stopPropagation();
            }}
            className="pointer-events-auto inline-flex cursor-pointer items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/60"
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden />
            <span>Reset zoom</span>
          </button>
        </div>
      ) : null}

      {lockedInspection ? (
        <div
          className="pointer-events-none absolute z-30 w-56 rounded-xl border border-slate-200 bg-white/95 px-4 py-3 shadow-lg backdrop-blur-sm sm:w-60"
          style={{ left: lockedInspection.tooltipX, top: lockedInspection.tooltipY }}
        >
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
            Year {lockedInspection.year}
          </p>
          <div className="mt-2 flex items-center gap-2">
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: lockedSeries?.color ?? "#0f172a" }}
              aria-hidden
            />
            <p className="text-sm font-semibold text-slate-900">{lockedSeries?.label ?? lockedInspection.seriesId}</p>
          </div>
          <p className="mt-2 text-lg font-semibold text-slate-900">
            {lockedInspection.value === null
              ? "No data"
              : formatMetricValue(lockedInspection.value, lockedSeries?.unit ?? undefined, { mode: normalization })}
          </p>
          {normalization === "indexed" && lockedInspection.rawValue !== null ? (
            <p className="mt-1 text-xs text-slate-500">
              Raw: {formatMetricValue(lockedInspection.rawValue, lockedSeries?.unit ?? undefined)}
            </p>
          ) : null}
        </div>
      ) : null}

      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={visibleData} margin={chartMargin} onMouseLeave={hideHoverTooltip}>
          <CartesianGrid
            stroke="rgba(100, 116, 139, 0.46)"
            strokeDasharray="4 6"
            vertical
            verticalCoordinatesGenerator={verticalGridCoordinatesGenerator}
          />
          <XAxis
            dataKey="year"
            type="number"
            scale="linear"
            domain={[visibleStartYear, visibleEndYear]}
            ticks={yearTicks}
            interval={0}
            allowDecimals={false}
            stroke="#94a3b8"
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            tick={{ fontSize: axisTickFontSize, fill: "#475569" }}
            tickFormatter={xAxisTickFormatter}
            padding={{ left: 0, right: 0 }}
          />
          <YAxis
            stroke="#94a3b8"
            width={yAxisWidth}
            domain={yDomain as [number, number]}
            tickFormatter={yAxisTickFormatter}
            tickLine={false}
            axisLine={false}
            tickMargin={yAxisTickMargin}
            tick={{ fontSize: axisTickFontSize, fill: "#475569" }}
          />
          <Tooltip
            content={
              <TooltipContent
                hoveredSeriesId={lockedInspection ? null : hoveredSeriesId}
                normalization={normalization}
                series={series}
              />
            }
            cursor={false}
            shared={false}
            allowEscapeViewBox={{ x: false, y: false }}
            wrapperStyle={{ pointerEvents: "none", zIndex: 20 }}
            isAnimationActive={false}
          />
          {series.flatMap((item) => {
            const isActive = activeSeriesId === item.id;
            const isLocked = lockedInspection?.seriesId === item.id;
            const renderLockedDot = ({ cx, cy, payload }: LockedDotProps) => {
              if (!isLocked || payload?.year !== lockedInspection?.year || typeof cx !== "number" || typeof cy !== "number") {
                return <g />;
              }

              return <circle cx={cx} cy={cy} r={4.5} fill={item.color} stroke="#ffffff" strokeWidth={2} />;
            };

            return [
              <Line
                key={`${item.id}-interaction`}
                type="monotone"
                dataKey={item.id}
                name={item.label}
                stroke={item.color}
                strokeWidth={interactionStrokeWidth}
                strokeOpacity={0}
                dot={false}
                activeDot={false}
                isAnimationActive={false}
                connectNulls
                onPointerDown={(_, event) => {
                  startLineInspection(item.id, event);
                }}
                onMouseEnter={() => {
                  if (panSessionRef.current) return;
                  if (lockedInspection) return;
                  setHoveredSeriesId(item.id);
                }}
                onMouseMove={() => {
                  if (panSessionRef.current) return;
                  if (lockedInspection) return;
                  setHoveredSeriesId(item.id);
                }}
                onMouseLeave={() => {
                  if (lockedInspection) return;
                  setHoveredSeriesId((previous) => (previous === item.id ? null : previous));
                }}
              />,
              <Line
                key={item.id}
                type="monotone"
                dataKey={item.id}
                name={item.label}
                stroke={item.color}
                strokeWidth={isLocked ? 3.3 : isActive ? 3 : baseStrokeWidth}
                strokeDasharray={item.dashArray}
                strokeOpacity={activeSeriesId ? (isActive ? 1 : lockedInspection ? 0.28 : 0.2) : 0.94}
                dot={isLocked ? renderLockedDot : false}
                activeDot={
                  isActive && !lockedInspection
                    ? {
                        r: 4,
                        strokeWidth: 0,
                        fill: item.color,
                        pointerEvents: "none",
                        onMouseEnter: () => {
                          if (panSessionRef.current) return;
                          if (lockedInspection) return;
                          setHoveredSeriesId(item.id);
                        },
                        onMouseMove: () => {
                          if (panSessionRef.current) return;
                          if (lockedInspection) return;
                          setHoveredSeriesId(item.id);
                        },
                      }
                    : false
                }
                isAnimationActive={false}
                connectNulls
              />,
            ];
          })}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
