"use client";

import { ReactNode, useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Banknote,
  BarChart3,
  Briefcase,
  Check,
  ChevronDown,
  CloudRain,
  Home,
  Snowflake,
  Thermometer,
  Tornado,
  UserRound,
  Users,
} from "lucide-react";

export type MetricOption = {
  id: string;
  name: string;
  unit?: string | null;
  category?: string | null;
};

type Props = {
  metrics: MetricOption[];
  value: string;
  onChange: (metricId: string) => void;
  className?: string;
  variant?: "default" | "stealthTitle";
  portal?: boolean;
  showLabel?: boolean;
  showCategoryChip?: boolean;
};

type DropdownPosition = {
  left: number;
  top: number;
  width: number;
};

export type MetricGroup = "Weather" | "People" | "Money" | "Other";

type MetricGroupSection = {
  group: MetricGroup;
  metrics: Array<{ metric: MetricOption; index: number }>;
};

const DROPDOWN_VIEWPORT_PADDING = 8;
const DROPDOWN_VERTICAL_GAP = 8;
const DROPDOWN_OPTION_HEIGHT = 52;
const DROPDOWN_GROUP_HEADING_HEIGHT = 30;
const DROPDOWN_VERTICAL_PADDING = 12;
const METRIC_GROUP_ORDER: MetricGroup[] = ["Money", "People", "Weather", "Other"];
const METRIC_GROUP_BY_ID: Record<string, MetricGroup> = {
  annual_precipitation: "Weather",
  annual_snowfall: "Weather",
  average_annual_temperature: "Weather",
  earthquake_count: "Weather",
  tornado_count: "Weather",
  population_total: "People",
  unemployment_rate: "People",
  median_age: "People",
  median_home_value: "Money",
  median_household_income: "Money",
};
const METRIC_ORDER_BY_ID: Record<string, number> = {
  annual_precipitation: 0,
  annual_snowfall: 1,
  average_annual_temperature: 2,
  earthquake_count: 3,
  tornado_count: 4,
  population_total: 5,
  unemployment_rate: 6,
  median_age: 7,
  median_home_value: 8,
  median_household_income: 9,
};

export function getMetricGroup(metricId: string): MetricGroup {
  return METRIC_GROUP_BY_ID[metricId] ?? "Other";
}

function buildMetricGroupSections(metrics: MetricOption[]): MetricGroupSection[] {
  const sortedMetrics = metrics
    .map((metric, originalIndex) => ({ metric, originalIndex }))
    .sort((left, right) => {
      const leftGroupIndex = METRIC_GROUP_ORDER.indexOf(getMetricGroup(left.metric.id));
      const rightGroupIndex = METRIC_GROUP_ORDER.indexOf(getMetricGroup(right.metric.id));

      if (leftGroupIndex !== rightGroupIndex) {
        return leftGroupIndex - rightGroupIndex;
      }

      const leftMetricIndex = METRIC_ORDER_BY_ID[left.metric.id] ?? Number.MAX_SAFE_INTEGER;
      const rightMetricIndex = METRIC_ORDER_BY_ID[right.metric.id] ?? Number.MAX_SAFE_INTEGER;

      if (leftMetricIndex !== rightMetricIndex) {
        return leftMetricIndex - rightMetricIndex;
      }

      return left.originalIndex - right.originalIndex;
    });

  const groupedMetrics = new Map<MetricGroup, MetricOption[]>();
  sortedMetrics.forEach(({ metric }) => {
    const group = getMetricGroup(metric.id);
    const groupMetrics = groupedMetrics.get(group) ?? [];
    groupMetrics.push(metric);
    groupedMetrics.set(group, groupMetrics);
  });

  let optionIndex = 0;
  return METRIC_GROUP_ORDER.flatMap((group) => {
    const groupMetrics = groupedMetrics.get(group);
    if (!groupMetrics?.length) return [];

    return [
      {
        group,
        metrics: groupMetrics.map((metric) => ({
          metric,
          index: optionIndex++,
        })),
      },
    ];
  });
}

function EarthquakeIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
      focusable="false"
    >
      <path d="M3 12h3l2-5 3 12 3-14 2 7h5" />
      <path d="M3 18h18" opacity="0.35" />
    </svg>
  );
}

export function getMetricIcon(metricId: string, className = "h-4 w-4"): ReactNode {
  switch (metricId) {
    case "median_household_income":
      return <Banknote className={className} aria-hidden />;
    case "median_home_value":
      return <Home className={className} aria-hidden />;
    case "population_total":
      return <Users className={className} aria-hidden />;
    case "unemployment_rate":
      return <Briefcase className={className} aria-hidden />;
    case "median_age":
      return <UserRound className={className} aria-hidden />;
    case "annual_precipitation":
      return <CloudRain className={className} aria-hidden />;
    case "annual_snowfall":
      return <Snowflake className={className} aria-hidden />;
    case "average_annual_temperature":
      return <Thermometer className={className} aria-hidden />;
    case "earthquake_count":
      return <EarthquakeIcon className={className} />;
    case "tornado_count":
      return <Tornado className={className} aria-hidden />;
    default:
      return <BarChart3 className={className} aria-hidden />;
  }
}

function getMetricMeta(metric: MetricOption): string {
  const parts = [metric.category, metric.unit].filter((part): part is string => Boolean(part));
  return parts.length ? parts.join(" • ") : "State-level metric";
}

function normalizePillLabel(rawValue: string): string {
  const cleaned = rawValue.replace(/[()]/g, "").trim();
  if (!cleaned) return "";

  const lower = cleaned.toLowerCase();
  if (lower.includes("%") || lower === "percent" || lower === "percentage") return "%";
  if (lower === "usd" || lower === "us dollars" || lower === "dollars" || lower === "$") return "USD";
  if (lower === "people" || lower === "person" || lower === "persons") return "PEOPLE";
  if (lower === "years" || lower === "year" || lower === "yrs") return "YEARS";

  return cleaned.toUpperCase();
}

function getUnitPillLabel(metric?: MetricOption): string | null {
  if (!metric) return null;

  if (metric.unit) {
    const normalizedUnit = normalizePillLabel(metric.unit);
    if (normalizedUnit) return normalizedUnit;
  }

  if (metric.category) {
    const normalizedCategory = normalizePillLabel(metric.category);
    if (normalizedCategory) return normalizedCategory;
  }

  return null;
}

export function MetricSelect({
  metrics,
  value,
  onChange,
  className,
  variant = "default",
  portal = true,
  showLabel = true,
  showCategoryChip = true,
}: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [dropdownPosition, setDropdownPosition] = useState<DropdownPosition | null>(null);
  const listboxId = useId();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const portalRef = useRef<HTMLDivElement | null>(null);
  const listboxRef = useRef<HTMLDivElement | null>(null);
  const optionRefs = useRef<Array<HTMLDivElement | null>>([]);

  const metricGroupSections = useMemo(() => buildMetricGroupSections(metrics), [metrics]);
  const orderedMetrics = useMemo(
    () => metricGroupSections.flatMap((section) => section.metrics.map(({ metric }) => metric)),
    [metricGroupSections],
  );
  const selectedIndex = useMemo(() => orderedMetrics.findIndex((metric) => metric.id === value), [orderedMetrics, value]);
  const selectedMetric = selectedIndex >= 0 ? orderedMetrics[selectedIndex] : orderedMetrics[0];
  const triggerPillLabel = useMemo(() => getUnitPillLabel(selectedMetric), [selectedMetric]);
  const isStealth = variant === "stealthTitle";

  const getDropdownPosition = useCallback((): DropdownPosition | null => {
    const trigger = triggerRef.current;
    if (!trigger) return null;
    const rect = trigger.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    const viewportWidth = typeof window === "undefined" ? rect.width : window.innerWidth;
    const viewportHeight = typeof window === "undefined" ? rect.bottom : window.innerHeight;
    const estimatedDropdownHeight =
      orderedMetrics.length * DROPDOWN_OPTION_HEIGHT +
      metricGroupSections.length * DROPDOWN_GROUP_HEADING_HEIGHT +
      DROPDOWN_VERTICAL_PADDING;
    const minStealthWidth = 320;
    const desiredWidth = isStealth ? Math.max(rect.width, minStealthWidth) : rect.width;
    const maxWidth = Math.max(220, viewportWidth - DROPDOWN_VIEWPORT_PADDING * 2);
    const width = Math.min(desiredWidth, maxWidth);
    const maxLeft = viewportWidth - DROPDOWN_VIEWPORT_PADDING - width;
    const left = Math.min(Math.max(DROPDOWN_VIEWPORT_PADDING, rect.left), maxLeft);
    const preferredTop = rect.bottom + DROPDOWN_VERTICAL_GAP;
    const maxTop = viewportHeight - DROPDOWN_VIEWPORT_PADDING - estimatedDropdownHeight;
    const bottomRoom = viewportHeight - DROPDOWN_VIEWPORT_PADDING - preferredTop;
    const topRoom = rect.top - DROPDOWN_VERTICAL_GAP - DROPDOWN_VIEWPORT_PADDING;
    const shouldOpenAbove = estimatedDropdownHeight > bottomRoom && topRoom > bottomRoom;
    const top = shouldOpenAbove
      ? Math.max(DROPDOWN_VIEWPORT_PADDING, rect.top - DROPDOWN_VERTICAL_GAP - estimatedDropdownHeight)
      : Math.max(DROPDOWN_VIEWPORT_PADDING, Math.min(preferredTop, maxTop));
    return {
      left,
      top,
      width,
    };
  }, [isStealth, metricGroupSections.length, orderedMetrics.length]);

  const openMenu = (targetIndex: number) => {
    if (!orderedMetrics.length) return;
    const nextPosition = getDropdownPosition();
    if (!nextPosition) return;
    const bounded = Math.min(Math.max(targetIndex, 0), orderedMetrics.length - 1);
    setActiveIndex(bounded);
    setDropdownPosition(nextPosition);
    setIsOpen(true);
  };

  const closeMenu = () => {
    setIsOpen(false);
  };

  const selectByIndex = (index: number) => {
    const next = orderedMetrics[index];
    if (!next) return;
    onChange(next.id);
    setActiveIndex(index);
    closeMenu();
    triggerRef.current?.focus();
  };

  const moveActive = (delta: number) => {
    if (!orderedMetrics.length) return;
    setActiveIndex((prev) => {
      const current = prev >= 0 && prev < orderedMetrics.length ? prev : selectedIndex >= 0 ? selectedIndex : 0;
      return (current + delta + orderedMetrics.length) % orderedMetrics.length;
    });
  };

  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      const rootContains = rootRef.current?.contains(target);
      const portalContains = portalRef.current?.contains(target);
      if (!rootContains && !portalContains) {
        closeMenu();
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const updatePosition = () => {
      const nextPosition = getDropdownPosition();
      if (!nextPosition) {
        setIsOpen(false);
        return;
      }
      setDropdownPosition((previous) => {
        if (
          previous &&
          previous.left === nextPosition.left &&
          previous.top === nextPosition.top &&
          previous.width === nextPosition.width
        ) {
          return previous;
        }
        return nextPosition;
      });
    };

    updatePosition();
    window.addEventListener("scroll", updatePosition, true);
    window.addEventListener("resize", updatePosition);
    return () => {
      window.removeEventListener("scroll", updatePosition, true);
      window.removeEventListener("resize", updatePosition);
    };
  }, [getDropdownPosition, isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const frame = requestAnimationFrame(() => {
      listboxRef.current?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [isOpen]);

  const dropdownContent = (
    <div
      id={listboxId}
      role="listbox"
      aria-label="Select metric"
      aria-activedescendant={orderedMetrics[activeIndex] ? `${listboxId}-option-${activeIndex}` : undefined}
      tabIndex={-1}
      ref={listboxRef}
      onKeyDown={(event) => {
        if (!orderedMetrics.length) return;
        if (event.key === "ArrowDown") {
          event.preventDefault();
          moveActive(1);
          return;
        }
        if (event.key === "ArrowUp") {
          event.preventDefault();
          moveActive(-1);
          return;
        }
        if (event.key === "Home") {
          event.preventDefault();
          setActiveIndex(0);
          return;
        }
        if (event.key === "End") {
          event.preventDefault();
          setActiveIndex(orderedMetrics.length - 1);
          return;
        }
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          selectByIndex(activeIndex);
          return;
        }
        if (event.key === "Escape") {
          event.preventDefault();
          closeMenu();
          triggerRef.current?.focus();
          return;
        }
        if (event.key === "Tab") {
          closeMenu();
        }
      }}
      className="max-h-[min(80vh,38rem)] overflow-y-auto rounded-2xl border border-slate-200 bg-white/95 p-1.5 shadow-lg backdrop-blur-sm focus:outline-none"
    >
      {metricGroupSections.map((section, sectionIndex) => (
        <div
          key={section.group}
          role="group"
          aria-labelledby={`${listboxId}-group-${section.group.toLowerCase()}`}
          className={sectionIndex === 0 ? "" : "mt-1 border-t border-slate-100 pt-1"}
        >
          <div
            id={`${listboxId}-group-${section.group.toLowerCase()}`}
            className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-500"
          >
            {section.group}
          </div>
          {section.metrics.map(({ metric, index }) => {
            const isSelected = metric.id === value;
            const isActive = index === activeIndex;
            return (
              <div
                key={metric.id}
                ref={(node) => {
                  optionRefs.current[index] = node;
                }}
                id={`${listboxId}-option-${index}`}
                role="option"
                aria-selected={isSelected}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => selectByIndex(index)}
                className={`flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2 transition-colors ${
                  isSelected
                    ? "bg-emerald-50 text-emerald-900"
                    : isActive
                      ? "bg-slate-100 text-slate-900"
                      : "text-slate-800 hover:bg-slate-50"
                }`}
              >
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
                  {getMetricIcon(metric.id)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium leading-tight text-slate-900">{metric.name}</span>
                  <span className="block truncate text-xs text-slate-500">{getMetricMeta(metric)}</span>
                </span>
                {isSelected ? <Check className="h-4 w-4 shrink-0 text-emerald-700" aria-hidden /> : null}
              </div>
            );
          })}
        </div>
      ))}
      {!metricGroupSections.length ? (
        <div className="px-3 py-2 text-sm text-slate-500">No metrics available</div>
      ) : null}
    </div>
  );

  const dropdownWrapperClass = portal
    ? ""
    : "absolute left-0 right-0 top-[calc(100%+0.5rem)] z-30";

  const dropdown =
    isOpen && dropdownPosition
      ? portal && typeof window !== "undefined"
        ? createPortal(
            <div
              ref={portalRef}
              style={{
                position: "fixed",
                left: dropdownPosition.left,
                top: dropdownPosition.top,
                width: dropdownPosition.width,
                zIndex: 9999,
              }}
            >
              {dropdownContent}
            </div>,
            document.body,
          )
        : (
            <div ref={portalRef} className={dropdownWrapperClass}>
              {dropdownContent}
            </div>
          )
      : null;

  return (
    <div className={className} ref={rootRef}>
      <div className="relative w-full">
        <button
          ref={triggerRef}
          type="button"
          aria-haspopup="listbox"
          aria-expanded={isOpen}
          aria-controls={listboxId}
          aria-label={isStealth ? "Change metric" : undefined}
          onClick={() => (isOpen ? closeMenu() : openMenu(selectedIndex >= 0 ? selectedIndex : 0))}
          onKeyDown={(event) => {
            if (!orderedMetrics.length) return;
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              event.preventDefault();
              if (!isOpen) {
                openMenu(selectedIndex >= 0 ? selectedIndex : 0);
              } else {
                moveActive(event.key === "ArrowDown" ? 1 : -1);
              }
              return;
            }
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              if (!isOpen) {
                openMenu(selectedIndex >= 0 ? selectedIndex : 0);
              } else {
                selectByIndex(activeIndex);
              }
            }
            if (event.key === "Escape" && isOpen) {
              event.preventDefault();
              closeMenu();
            }
          }}
          className={
            isStealth
              ? `group inline-flex w-full cursor-pointer items-center justify-between gap-1.5 rounded-lg border text-left transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/60 ${
                  isOpen
                    ? "border-slate-200/80 bg-slate-900/5 px-2 py-1"
                    : "border-transparent bg-transparent px-1 py-0.5 hover:border-slate-200/80 hover:bg-slate-900/5 hover:px-2 hover:py-1 focus-visible:border-slate-200/80 focus-visible:bg-slate-900/5 focus-visible:px-2 focus-visible:py-1"
                }`
              : "group flex w-full cursor-pointer items-center justify-between gap-3 rounded-full border border-slate-200 bg-white/85 px-3 py-2 text-left shadow-[0_6px_16px_rgba(0,0,0,0.07)] backdrop-blur-sm transition-colors duration-150 hover:border-slate-300 hover:bg-white/95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/70"
          }
        >
          <span className="min-w-0">
            {showLabel ? (
              <span className="block text-[10px] font-semibold uppercase tracking-[0.24em] text-slate-500">Metric</span>
            ) : null}
            <span className={`flex min-w-0 items-center gap-1.5 ${showLabel ? "mt-0.5" : ""}`}>
              <span
                className={
                  isStealth
                    ? "inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-md bg-slate-200/70 text-slate-600"
                    : "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600"
                }
              >
                {getMetricIcon(selectedMetric?.id ?? "", isStealth ? "h-3 w-3" : "h-4 w-4")}
              </span>
              <span
                className={
                  isStealth
                    ? "min-w-0 flex-1 text-base font-semibold leading-tight text-slate-900"
                    : "truncate text-sm font-medium text-slate-900"
                }
              >
                {selectedMetric?.name ?? "Select metric"}
              </span>
              {showCategoryChip && triggerPillLabel ? (
                <span className="hidden rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500 sm:inline-flex">
                  {triggerPillLabel}
                </span>
              ) : null}
            </span>
          </span>
          <ChevronDown
            className={
              isStealth
                ? `h-3.5 shrink-0 text-slate-500 transition-all duration-150 ${
                    isOpen ? "ml-1 w-3.5 opacity-100 scale-100 rotate-180" : "ml-0 w-0 opacity-0 scale-90"
                  } group-hover:ml-1 group-hover:w-3.5 group-hover:opacity-100 group-hover:scale-100 group-focus-visible:ml-1 group-focus-visible:w-3.5 group-focus-visible:opacity-100 group-focus-visible:scale-100`
                : `h-4 w-4 shrink-0 text-slate-500 transition-transform duration-150 ${isOpen ? "rotate-180" : ""}`
            }
            aria-hidden
          />
        </button>
        {dropdown}
      </div>
    </div>
  );
}
