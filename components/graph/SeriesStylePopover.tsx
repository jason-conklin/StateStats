"use client";

import { useEffect, useMemo, useRef, type CSSProperties } from "react";
import { X } from "lucide-react";
import type { ChartSeries, SeriesStyle } from "./chartTypes";

export type PopoverAnchorRect = {
  bottom: number;
  height: number;
  left: number;
  top: number;
  width: number;
};

type LineStyleOption = {
  label: string;
  strokeDasharray: string;
};

type Props = {
  anchorRect: PopoverAnchorRect;
  hasCustomStyle: boolean;
  series: ChartSeries;
  style: SeriesStyle;
  onChange: (patch: SeriesStyle) => void;
  onClose: () => void;
  onReset: () => void;
};

const POPOVER_WIDTH = 304;
const POPOVER_HEIGHT = 344;
const VIEWPORT_PADDING = 12;
const ANCHOR_GAP = 10;

const PRESET_COLORS = [
  "#2563eb",
  "#7c3aed",
  "#db2777",
  "#dc2626",
  "#ea580c",
  "#ca8a04",
  "#059669",
  "#0f766e",
  "#0891b2",
  "#475569",
  "#111827",
  "#65a30d",
] as const;

const LINE_STYLE_OPTIONS: LineStyleOption[] = [
  { label: "Solid", strokeDasharray: "" },
  { label: "Dashed", strokeDasharray: "8 4" },
  { label: "Dotted", strokeDasharray: "2 4" },
  { label: "Dash-dot", strokeDasharray: "10 4 2 4" },
];

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function hslToHex(hue: number, saturation: number, lightness: number) {
  const normalizedSaturation = saturation / 100;
  const normalizedLightness = lightness / 100;
  const chroma = (1 - Math.abs(2 * normalizedLightness - 1)) * normalizedSaturation;
  const secondary = chroma * (1 - Math.abs(((hue / 60) % 2) - 1));
  const match = normalizedLightness - chroma / 2;
  const [red, green, blue] =
    hue < 60
      ? [chroma, secondary, 0]
      : hue < 120
        ? [secondary, chroma, 0]
        : hue < 180
          ? [0, chroma, secondary]
          : hue < 240
            ? [0, secondary, chroma]
            : hue < 300
              ? [secondary, 0, chroma]
              : [chroma, 0, secondary];

  return [red, green, blue]
    .map((channel) => Math.round((channel + match) * 255).toString(16).padStart(2, "0"))
    .join("");
}

function getColorInputValue(color: string) {
  if (/^#[0-9a-f]{6}$/i.test(color)) {
    return color;
  }

  const hslMatch = color.match(/^hsl\(\s*([\d.]+)\s+([\d.]+)%\s+([\d.]+)%\s*\)$/i);
  if (hslMatch) {
    return `#${hslToHex(Number(hslMatch[1]), Number(hslMatch[2]), Number(hslMatch[3]))}`;
  }

  return PRESET_COLORS[0];
}

function getPopoverStyle(anchorRect: PopoverAnchorRect): CSSProperties {
  if (typeof window === "undefined") {
    return {};
  }

  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;

  if (viewportWidth < 640) {
    return {
      bottom: VIEWPORT_PADDING,
      left: VIEWPORT_PADDING,
      position: "fixed",
      right: VIEWPORT_PADDING,
      zIndex: 50,
    };
  }

  const maxLeft = Math.max(VIEWPORT_PADDING, viewportWidth - POPOVER_WIDTH - VIEWPORT_PADDING);
  const left = clamp(anchorRect.left + anchorRect.width / 2 - POPOVER_WIDTH / 2, VIEWPORT_PADDING, maxLeft);
  const bottomSpace = viewportHeight - anchorRect.bottom;
  const maxTop = Math.max(VIEWPORT_PADDING, viewportHeight - POPOVER_HEIGHT - VIEWPORT_PADDING);
  const belowTop = anchorRect.bottom + ANCHOR_GAP;
  const aboveTop = anchorRect.top - POPOVER_HEIGHT - ANCHOR_GAP;
  const top =
    bottomSpace >= POPOVER_HEIGHT || aboveTop < VIEWPORT_PADDING
      ? clamp(belowTop, VIEWPORT_PADDING, maxTop)
      : clamp(aboveTop, VIEWPORT_PADDING, maxTop);

  return {
    left,
    position: "fixed",
    top,
    width: POPOVER_WIDTH,
    zIndex: 50,
  };
}

function PreviewLine({ color, strokeDasharray }: { color: string; strokeDasharray?: string }) {
  return (
    <svg className="h-4 w-12" viewBox="0 0 48 16" aria-hidden>
      <line
        x1="3"
        y1="8"
        x2="45"
        y2="8"
        stroke={color}
        strokeDasharray={strokeDasharray || undefined}
        strokeLinecap="round"
        strokeWidth="3"
      />
    </svg>
  );
}

export function SeriesStylePopover({
  anchorRect,
  hasCustomStyle,
  series,
  style,
  onChange,
  onClose,
  onReset,
}: Props) {
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const currentColor = style.color ?? series.color;
  const colorInputValue = getColorInputValue(currentColor);
  const currentDasharray = style.strokeDasharray ?? series.dashArray ?? "";
  const titleId = `series-style-${series.id}`;
  const popoverStyle = useMemo(() => getPopoverStyle(anchorRect), [anchorRect]);

  useEffect(() => {
    popoverRef.current?.focus();
  }, [series.id]);

  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      const target = event.target;
      if (target instanceof Node && popoverRef.current?.contains(target)) {
        return;
      }
      onClose();
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  return (
    <div
      ref={popoverRef}
      role="dialog"
      aria-labelledby={titleId}
      tabIndex={-1}
      className="max-h-[calc(100svh-1.5rem)] overflow-y-auto rounded-2xl border border-slate-200 bg-white p-4 text-slate-900 shadow-2xl outline-none"
      style={popoverStyle}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Line style</p>
          <h3 id={titleId} className="mt-1 truncate text-sm font-semibold text-slate-950">
            {series.label}
          </h3>
        </div>
        <button
          type="button"
          aria-label="Close line style popover"
          onClick={onClose}
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-slate-200 text-slate-500 transition hover:bg-slate-50 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/60"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>

      <div className="mt-4 space-y-3">
        <label className="flex items-center justify-between gap-3 text-sm font-medium text-slate-700">
          <span>Color</span>
          <input
            type="color"
            value={colorInputValue}
            onChange={(event) => onChange({ color: event.target.value })}
            className="h-9 w-12 cursor-pointer rounded-lg border border-slate-200 bg-white p-1"
            aria-label={`Choose color for ${series.label}`}
          />
        </label>

        <div className="grid grid-cols-6 gap-2" aria-label="Preset colors">
          {PRESET_COLORS.map((color) => {
            const active = color.toLowerCase() === colorInputValue.toLowerCase();
            return (
              <button
                key={color}
                type="button"
                aria-label={`Use ${color} for ${series.label}`}
                aria-pressed={active}
                onClick={() => onChange({ color })}
                className={`h-8 rounded-full border transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/60 ${
                  active ? "border-slate-900 ring-2 ring-slate-900/15" : "border-slate-200 hover:border-slate-400"
                }`}
                style={{ backgroundColor: color }}
              />
            );
          })}
        </div>
      </div>

      <div className="mt-5 space-y-2">
        <p className="text-sm font-medium text-slate-700">Pattern</p>
        <div className="grid grid-cols-2 gap-2">
          {LINE_STYLE_OPTIONS.map((option) => {
            const active = option.strokeDasharray === currentDasharray;
            return (
              <button
                key={option.label}
                type="button"
                aria-label={`Use ${option.label.toLowerCase()} line for ${series.label}`}
                aria-pressed={active}
                onClick={() => onChange({ strokeDasharray: option.strokeDasharray })}
                className={`flex items-center justify-between gap-2 rounded-xl border px-3 py-2 text-left text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/60 ${
                  active
                    ? "border-slate-900 bg-slate-50 text-slate-950"
                    : "border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50"
                }`}
              >
                <span>{option.label}</span>
                <PreviewLine color={currentColor} strokeDasharray={option.strokeDasharray} />
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-5 flex items-center justify-between border-t border-slate-100 pt-3">
        <button
          type="button"
          onClick={onReset}
          disabled={!hasCustomStyle}
          className="rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/60 disabled:cursor-not-allowed disabled:opacity-45"
        >
          Reset
        </button>
        <div className="rounded-full bg-slate-50 px-2.5 py-1">
          <PreviewLine color={currentColor} strokeDasharray={currentDasharray} />
        </div>
      </div>
    </div>
  );
}
