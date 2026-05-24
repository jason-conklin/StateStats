"use client";

import { states as allStates } from "@/lib/states";

const SERIES_HUES = [218, 8, 142, 26, 266, 193, 326, 46, 171, 236, 348, 92, 205] as const;
const SERIES_TONES = [
  { saturation: 76, lightness: 46 },
  { saturation: 74, lightness: 38 },
  { saturation: 70, lightness: 54 },
  { saturation: 72, lightness: 30 },
] as const;
const TOTAL_COLOR_SLOTS = SERIES_HUES.length * SERIES_TONES.length;
const DASH_PATTERNS = [undefined, "8 4", "4 3", "10 3 2 3"] as const;

const STATE_ORDER = new Map(allStates.map((state, index) => [state.id, index]));

function hashStateKey(key: string) {
  let hash = 0;
  for (let index = 0; index < key.length; index += 1) {
    hash = (hash * 33 + key.charCodeAt(index)) >>> 0;
  }
  return hash;
}

function getStableSeriesIndex(stateId: string) {
  const knownIndex = STATE_ORDER.get(stateId);
  if (knownIndex !== undefined) return knownIndex;
  return hashStateKey(stateId);
}

function getColorFromSlot(slotIndex: number) {
  const hue = SERIES_HUES[slotIndex % SERIES_HUES.length];
  const tone = SERIES_TONES[Math.floor(slotIndex / SERIES_HUES.length) % SERIES_TONES.length];
  return `hsl(${hue} ${tone.saturation}% ${tone.lightness}%)`;
}

export function getStateSeriesStyle(stateId: string) {
  const stableIndex = getStableSeriesIndex(stateId);
  const colorSlot = stableIndex % TOTAL_COLOR_SLOTS;
  const dashPatternIndex = Math.floor(stableIndex / TOTAL_COLOR_SLOTS);

  return {
    color: getColorFromSlot(colorSlot),
    dashArray: DASH_PATTERNS[dashPatternIndex % DASH_PATTERNS.length],
  };
}

export function getStateSeriesColor(stateId: string) {
  return getStateSeriesStyle(stateId).color;
}

export function getMetricSeriesStyle(metricId: string, index = 0) {
  const hash = hashStateKey(metricId);
  const stableIndex = (hash + index * 7) % TOTAL_COLOR_SLOTS;
  const dashPatternIndex = Math.floor((hash + index) / TOTAL_COLOR_SLOTS);

  return {
    color: getColorFromSlot(stableIndex),
    dashArray: DASH_PATTERNS[dashPatternIndex % DASH_PATTERNS.length],
  };
}
