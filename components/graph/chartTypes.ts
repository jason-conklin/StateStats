export type ComparisonMode = "states" | "metrics";

export type NormalizationMode = "raw" | "indexed";

export type SeriesPoint = {
  year: number;
  value: number | null;
};

export type ChartSeries = {
  id: string;
  label: string;
  unit?: string | null;
  color: string;
  dashArray?: string;
  points: SeriesPoint[];
};

export type SeriesStyle = {
  color?: string;
  strokeDasharray?: string;
};

export type SeriesStyleMap = Record<string, SeriesStyle>;

export type ChartDataRow = {
  year: number;
  [seriesKey: string]: number | null;
};

export function getRawValueKey(seriesId: string) {
  return `${seriesId}__raw`;
}
