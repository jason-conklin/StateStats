import type { ObservationInput } from "./utils";

export type WeatherProviderResult = {
  observations: ObservationInput[];
  years: number[];
  coverageByYear: Record<number, number>;
  warnings: string[];
  notices?: string[];
  failedYears?: number[];
  skippedYears?: number[];
  skippedRows?: number;
  details?: Record<string, unknown>;
};

export type YearRange = {
  startYear: number;
  endYear: number;
};

export function getYearBounds(rows: Array<{ year: number }>) {
  if (!rows.length) return { minYear: null as number | null, maxYear: null as number | null };
  let minYear = Number.POSITIVE_INFINITY;
  let maxYear = Number.NEGATIVE_INFINITY;
  for (const row of rows) {
    minYear = Math.min(minYear, row.year);
    maxYear = Math.max(maxYear, row.year);
  }
  return { minYear, maxYear };
}

export function uniqueSortedYears(rows: Array<{ year: number }>) {
  return Array.from(new Set(rows.map((row) => row.year))).sort((a, b) => a - b);
}

export function buildCoverageByYear(rows: Array<{ year: number; stateId: string }>) {
  const buckets = new Map<number, Set<string>>();
  for (const row of rows) {
    const bucket = buckets.get(row.year) ?? new Set<string>();
    bucket.add(row.stateId);
    buckets.set(row.year, bucket);
  }
  return Object.fromEntries(Array.from(buckets.entries()).map(([year, stateIds]) => [year, stateIds.size]));
}

export function roundTo(value: number, digits: number) {
  const multiplier = 10 ** digits;
  return Math.round(value * multiplier) / multiplier;
}
