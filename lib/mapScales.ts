import { interpolateRgbBasis } from "d3-interpolate";
import { scaleQuantize, scaleSequential } from "d3-scale";

export type QuantizeBucket = {
  color: string;
  label: string;
};

export type LegendTick = {
  value: number;
  offsetPct: number;
};

type MetricScaleConfig = {
  type: "linear-quantize" | "log-sequential";
  zeroBaseline?: boolean;
};

export type ChoroplethScale = {
  colorScale: ((value: number | null) => string) | null;
  gradient: string;
  domain: [number, number] | null;
  legendTicks?: LegendTick[];
};

// A higher-contrast sequential green palette (light → dark).
export const GREEN_STEPS = [
  "#f4fbf7",
  "#e0f5ea",
  "#c2ead7",
  "#9fdcc1",
  "#73c7a0",
  "#47aa7e",
  "#27825b",
  "#135640",
  "#032f22",
];
export const NO_DATA_COLOR = "#e5e7eb";

export const metricScaleConfig: Record<string, MetricScaleConfig> = {
  earthquake_count: {
    type: "log-sequential",
    zeroBaseline: true,
  },
};

function isValidDomainValue(value: number | null): value is number {
  return value !== null && Number.isFinite(value) && !Number.isNaN(value);
}

function getContinuousGradient() {
  return `linear-gradient(to right, ${GREEN_STEPS.join(", ")})`;
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

  const interpolator = interpolateRgbBasis(GREEN_STEPS);
  const scale = scaleSequential(interpolator).domain([min, max]);

  const colorScale = (value: number | null) => {
    if (value === null || Number.isNaN(value)) return NO_DATA_COLOR;
    return scale(value);
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

function createLogSequentialColorScale(min: number, max: number): ChoroplethScale {
  const interpolator = interpolateRgbBasis(GREEN_STEPS);
  const scale = scaleSequential(interpolator).domain([Math.log1p(min), Math.log1p(max)]);

  return {
    colorScale: (value: number | null) => {
      if (value === null || Number.isNaN(value) || value < 0) return NO_DATA_COLOR;
      return scale(Math.log1p(value));
    },
    gradient: getContinuousGradient(),
    domain: [min, max],
    legendTicks: buildEarthquakeLegendTicks(max),
  };
}

export function createMetricColorScale(
  metricId: string | null | undefined,
  min: number | null,
  max: number | null,
): ChoroplethScale {
  if (!isValidDomainValue(min) || !isValidDomainValue(max) || min === max) {
    return {
      colorScale: null,
      gradient: "",
      domain: null,
    };
  }

  const config = metricId ? metricScaleConfig[metricId] : undefined;
  const domainMin = config?.zeroBaseline ? 0 : min;
  const domainMax = max;

  if (config?.type === "log-sequential") {
    return createLogSequentialColorScale(domainMin, domainMax);
  }

  const { colorScale } = createQuantizeColorScale(domainMin, domainMax);
  const { gradient } = createContinuousColorScale(domainMin, domainMax);

  return {
    colorScale,
    gradient,
    domain: [domainMin, domainMax],
  };
}

export const NEUTRAL_COLOR = NO_DATA_COLOR;
