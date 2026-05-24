type MetricDisplayMode = "raw" | "indexed";

function formatNumber(value: number, maximumFractionDigits = 1) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits,
  }).format(value);
}

function formatCompactMagnitude(value: number, maximumFractionDigits = 1) {
  const absValue = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  const compactThresholds = [
    { divisor: 1_000_000_000, suffix: "B" },
    { divisor: 1_000_000, suffix: "M" },
    { divisor: 1_000, suffix: "K" },
  ] as const;

  for (let index = 0; index < compactThresholds.length; index += 1) {
    const threshold = compactThresholds[index];
    if (absValue < threshold.divisor) continue;

    const scaledValue = absValue / threshold.divisor;
    const roundedValue = Number(scaledValue.toFixed(maximumFractionDigits));
    const nextThreshold = compactThresholds[index - 1];

    if (roundedValue >= 1000 && nextThreshold) {
      return `${sign}${formatNumber(absValue / nextThreshold.divisor, maximumFractionDigits)}${nextThreshold.suffix}`;
    }

    return `${sign}${formatNumber(scaledValue, maximumFractionDigits)}${threshold.suffix}`;
  }

  return `${sign}${formatNumber(absValue, maximumFractionDigits)}`;
}

type FormatMetricOptions = {
  compact?: boolean;
  mode?: MetricDisplayMode;
};

export function formatMetricValue(
  value: number | null | undefined,
  unit?: string,
  options?: FormatMetricOptions,
) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "No data";
  }

  const mode = options?.mode ?? "raw";
  const compact = options?.compact ?? false;
  const normalizedUnit = unit?.toLowerCase();

  if (mode === "indexed") {
    return formatNumber(value, 1);
  }

  if (compact) {
    if (normalizedUnit === "usd") {
      const prefix = value < 0 ? "-$" : "$";
      return `${prefix}${formatCompactMagnitude(Math.abs(value), 1)}`;
    }

    if (unit === "%" || normalizedUnit === "percent") {
      return `${formatNumber(value, 1)}%`;
    }

    if (normalizedUnit === "°f" || normalizedUnit === "f" || normalizedUnit === "fahrenheit") {
      return `${formatNumber(value, 1)}°F`;
    }

    if (normalizedUnit === "in" || normalizedUnit === "inch" || normalizedUnit === "inches") {
      return `${formatNumber(value, 1)} in`;
    }

    if (normalizedUnit === "events" || normalizedUnit === "event") {
      return `${formatNumber(value, 0)} events`;
    }

    if (normalizedUnit === "people") {
      return formatCompactMagnitude(value, 1);
    }

    if (normalizedUnit === "years" || normalizedUnit === "year") {
      return formatCompactMagnitude(value, 1);
    }

    return formatCompactMagnitude(value, 1);
  }

  if (normalizedUnit === "usd") {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    }).format(value);
  }

  if (unit === "%" || normalizedUnit === "percent") {
    return `${value.toFixed(1)}%`;
  }

  if (normalizedUnit === "°f" || normalizedUnit === "f" || normalizedUnit === "fahrenheit") {
    return `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(value)}°F`;
  }

  if (normalizedUnit === "in" || normalizedUnit === "inch" || normalizedUnit === "inches") {
    return `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(value)} in`;
  }

  if (normalizedUnit === "events" || normalizedUnit === "event") {
    return `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value)} events`;
  }

  if (normalizedUnit === "people") {
    return `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value)} people`;
  }

  if (normalizedUnit === "years" || normalizedUnit === "year") {
    return `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(value)} years`;
  }

  return `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(value)}${unit ? ` ${unit}` : ""}`;
}

export function formatLegendValue(value: number) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value);
}

export function formatDateTime(date: Date | string | null | undefined) {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}
