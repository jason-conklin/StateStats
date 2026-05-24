import { interpolateLab } from "d3-interpolate";
import { scaleQuantize } from "d3-scale";

export type QuantizeBucket = {
  color: string;
  label: string;
};

export type LegendTick = {
  value: number;
  offsetPct: number;
};

type MetricScaleTransform = "linear" | "pow" | "log";

type MetricScaleConfig = {
  transform: MetricScaleTransform;
  exponent?: number;
  zeroBaseline?: boolean;
  domainStrategy?: "full" | "percentile";
  lowerPercentile?: number;
  upperPercentile?: number;
  legendTicks?: "earthquake";
  legendNote?: string;
};

export type ChoroplethScale = {
  colorScale: ((value: number | null) => string) | null;
  gradient: string;
  domain: [number, number] | null;
  legendTicks?: LegendTick[];
  legendNote?: string;
};

// A higher-contrast sequential green palette (light → dark).
export const GREEN_STEPS = [
  "#f2fbf6",
  "#e4f6ee",
  "#d4f0e4",
  "#c0e8d8",
  "#a9dfc9",
  "#8dd2b5",
  "#70c39e",
  "#55ae82",
  "#3b9467",
  "#277850",
  "#16583d",
  "#0a3d2d",
  "#032f22",
];
export const NO_DATA_COLOR = "#e5e7eb";

const DEFAULT_METRIC_SCALE_CONFIG: MetricScaleConfig = {
  transform: "pow",
  exponent: 0.7,
};

export const metricScaleConfig: Record<string, Partial<MetricScaleConfig>> = {
  average_annual_temperature: {
    domainStrategy: "percentile",
    lowerPercentile: 0.05,
    upperPercentile: 0.95,
    legendNote: "Color scale trimmed for outliers",
  },
  earthquake_count: {
    transform: "log",
    zeroBaseline: true,
    legendTicks: "earthquake",
  },
};

function isValidDomainValue(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && !Number.isNaN(value);
}

function getContinuousGradient() {
  const stopCount = 18;
  const stops = Array.from({ length: stopCount }, (_, index) => {
    const t = index / (stopCount - 1);
    return `${interpolatePalette(t)} ${(t * 100).toFixed(1)}%`;
  });

  return `linear-gradient(to right, ${stops.join(", ")})`;
}

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value));
}

function interpolatePalette(t: number) {
  const normalizedT = clamp01(t);
  const scaled = normalizedT * (GREEN_STEPS.length - 1);
  const index = Math.min(GREEN_STEPS.length - 2, Math.floor(scaled));
  const localT = scaled - index;

  return interpolateLab(GREEN_STEPS[index], GREEN_STEPS[index + 1])(localT);
}

function normalizeValue(value: number, min: number, max: number) {
  if (max <= min) return 0;
  return clamp01((value - min) / (max - min));
}

function transformNormalizedValue(t: number, config: MetricScaleConfig) {
  const normalizedT = clamp01(t);

  if (config.transform === "pow") {
    return normalizedT ** (config.exponent ?? DEFAULT_METRIC_SCALE_CONFIG.exponent ?? 0.7);
  }

  return normalizedT;
}

function transformRawValue(value: number, min: number, max: number, config: MetricScaleConfig) {
  if (config.transform === "log") {
    if (value < 0 || min < 0 || max < 0) return null;
    const logMin = Math.log1p(min);
    const logMax = Math.log1p(max);
    const span = logMax - logMin;
    if (span <= 0) return 0;
    return clamp01((Math.log1p(value) - logMin) / span);
  }

  return transformNormalizedValue(normalizeValue(value, min, max), config);
}

function getNumericValues(values: Array<number | null | undefined> | undefined) {
  return (values ?? []).filter((value): value is number => isValidDomainValue(value));
}

function getPercentile(sortedValues: number[], percentile: number) {
  if (!sortedValues.length) return null;
  if (sortedValues.length === 1) return sortedValues[0];

  const boundedPercentile = clamp01(percentile);
  const index = (sortedValues.length - 1) * boundedPercentile;
  const lowerIndex = Math.floor(index);
  const upperIndex = Math.ceil(index);
  const lowerValue = sortedValues[lowerIndex];
  const upperValue = sortedValues[upperIndex];

  if (lowerIndex === upperIndex || upperValue === undefined) return lowerValue;

  return lowerValue + (upperValue - lowerValue) * (index - lowerIndex);
}

function resolveColorDomain(
  min: number,
  max: number,
  config: MetricScaleConfig,
  values?: Array<number | null | undefined>,
): [number, number] {
  if (config.domainStrategy !== "percentile") {
    return [config.zeroBaseline ? 0 : min, max];
  }

  const sortedValues = getNumericValues(values).sort((a, b) => a - b);
  const percentileMin = getPercentile(sortedValues, config.lowerPercentile ?? 0.05);
  const percentileMax = getPercentile(sortedValues, config.upperPercentile ?? 0.95);

  if (
    !isValidDomainValue(percentileMin) ||
    !isValidDomainValue(percentileMax) ||
    percentileMin >= percentileMax
  ) {
    return [config.zeroBaseline ? 0 : min, max];
  }

  return [percentileMin, percentileMax];
}

export function createQuantizeColorScale(min: number | null, max: number | null) {
  if (min === null || max === null || Number.isNaN(min) || Number.isNaN(max) || min === max) {
    return {
      colorScale: () => NO_DATA_COLOR,
      buckets: [],
    };
  }

  const quantize = scaleQuantize<string>().domain([min, max]).range(GREEN_STEPS);

  const thresholds = quantize.thresholds();
  const buckets: QuantizeBucket[] = GREEN_STEPS.map((color, index) => {
    const start = index === 0 ? min : thresholds[index - 1];
    const end = thresholds[index] ?? max;
    const label = `${Math.round(start).toLocaleString()} – ${Math.round(end).toLocaleString()}`;
    return { color, label };
  });

  const colorScale = (value: number | null) => {
    if (value === null || Number.isNaN(value)) return NO_DATA_COLOR;
    return quantize(value);
  };

  return { colorScale, buckets };
}

export function createContinuousColorScale(min: number | null, max: number | null) {
  if (min === null || max === null || Number.isNaN(min) || Number.isNaN(max) || min === max) {
    return {
      colorScale: () => NO_DATA_COLOR,
      gradient: `linear-gradient(to right, ${NO_DATA_COLOR}, ${NO_DATA_COLOR})`,
    };
  }

  const colorScale = (value: number | null) => {
    if (value === null || Number.isNaN(value)) return NO_DATA_COLOR;
    return interpolatePalette(normalizeValue(value, min, max));
  };

  const gradient = getContinuousGradient();

  return { colorScale, gradient };
}

function getLogOffsetPercent(value: number, min: number, max: number) {
  if (value < 0 || min < 0 || max < 0) return 0;

  const logMin = Math.log1p(min);
  const logMax = Math.log1p(max);
  const span = logMax - logMin;
  if (span <= 0) return 0;

  const offset = ((Math.log1p(value) - logMin) / span) * 100;
  return Math.min(100, Math.max(0, offset));
}

function buildEarthquakeLegendTicks(max: number): LegendTick[] {
  const fixedTicks = [0, 10, 50, 200].filter((tick) => tick <= max);
  const ticks = Array.from(new Set([...fixedTicks, max])).sort((a, b) => a - b);

  return ticks.map((value) => ({
    value,
    offsetPct: getLogOffsetPercent(value, 0, max),
  }));
}

function createConfiguredSequentialColorScale(
  min: number,
  max: number,
  config: MetricScaleConfig,
): ChoroplethScale {
  const legendTicks = config.legendTicks === "earthquake" ? buildEarthquakeLegendTicks(max) : undefined;

  return {
    colorScale: (value: number | null) => {
      if (value === null || Number.isNaN(value)) return NO_DATA_COLOR;
      const transformedValue = transformRawValue(value, min, max, config);
      return transformedValue === null ? NO_DATA_COLOR : interpolatePalette(transformedValue);
    },
    gradient: getContinuousGradient(),
    domain: [min, max],
    legendTicks,
    legendNote: config.legendNote,
  };
}

export function createMetricColorScale(
  metricId: string | null | undefined,
  min: number | null,
  max: number | null,
  values?: Array<number | null | undefined>,
): ChoroplethScale {
  if (!isValidDomainValue(min) || !isValidDomainValue(max) || min === max) {
    return {
      colorScale: null,
      gradient: "",
      domain: null,
    };
  }

  const config: MetricScaleConfig = {
    ...DEFAULT_METRIC_SCALE_CONFIG,
    ...(metricId ? metricScaleConfig[metricId] : undefined),
  };
  const [domainMin, domainMax] = resolveColorDomain(min, max, config, values);

  return createConfiguredSequentialColorScale(domainMin, domainMax, config);
}

export const NEUTRAL_COLOR = NO_DATA_COLOR;
