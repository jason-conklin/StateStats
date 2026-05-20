import { MapExplorer } from "@/components/map/MapExplorer";
import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { getUSStateFeatures } from "@/lib/mapData";
import { states as stateList } from "@/lib/states";
import { ensureCatalog } from "@/lib/metrics";

const EXCLUDED_STATE_IDS = new Set(["11"]);
const mapStates = stateList.filter((state) => !EXCLUDED_STATE_IDS.has(state.id));

type MetricData = {
  id: string;
  name: string;
  unit?: string | null;
  description?: string | null;
  sourceName?: string | null;
  category?: string | null;
  isDefault?: boolean | null;
  years: number[];
  minYear: number | null;
  maxYear: number | null;
  dataByYear: Record<number, Record<string, number | null>>;
  minValue: number | null;
  maxValue: number | null;
};

export const metadata: Metadata = {
  title: "StateStats",
};

export const runtime = "nodejs";

async function loadMapData() {
  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
  const maxRetries = 2;
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      await ensureCatalog(prisma);

      const metrics = await prisma.metric.findMany({
        include: { source: true },
        orderBy: { name: "asc" },
      });

      const metricIds = metrics.map((m) => m.id);
      const observations = await prisma.observation.findMany({
        where: {
          metricId: { in: metricIds },
          stateId: { notIn: Array.from(EXCLUDED_STATE_IDS) },
        },
        select: { metricId: true, stateId: true, year: true, value: true },
      });

      const metricData: Record<string, MetricData> = {};
      metrics.forEach((metric) => {
        metricData[metric.id] = {
          id: metric.id,
          name: metric.name,
          unit: metric.unit,
          description: metric.description,
          sourceName: metric.source?.name ?? null,
          category: metric.category,
          isDefault: metric.isDefault,
          years: [],
          minYear: null,
          maxYear: null,
          dataByYear: {},
          minValue: null,
          maxValue: null,
        };
      });

      observations.forEach((obs) => {
        const metric = metricData[obs.metricId];
        if (!metric) return;

        const yearBucket = metric.dataByYear[obs.year] ?? {};
        yearBucket[obs.stateId] = typeof obs.value === "number" ? obs.value : Number(obs.value);
        metric.dataByYear[obs.year] = yearBucket;

        // Track min/max
        const numericValue = yearBucket[obs.stateId];
        if (numericValue !== null && numericValue !== undefined && !Number.isNaN(numericValue)) {
          metric.minValue = metric.minValue === null ? numericValue : Math.min(metric.minValue, numericValue);
          metric.maxValue = metric.maxValue === null ? numericValue : Math.max(metric.maxValue, numericValue);
        }
      });

      // Finalize year arrays
      Object.values(metricData).forEach((metric) => {
        const years = Object.keys(metric.dataByYear)
          .map((year) => Number(year))
          .sort((a, b) => a - b);
        metric.years = years;
        metric.minYear = years.length ? years[0] : null;
        metric.maxYear = years.length ? years[years.length - 1] : null;
      });

      const defaultMetricId =
        metricData["median_household_income"]?.id ??
        metrics.find((m) => m.isDefault)?.id ??
        metrics[0]?.id ??
        "median_household_income";
      const defaultYear =
        metricData[defaultMetricId]?.years[metricData[defaultMetricId].years.length - 1] ?? new Date().getFullYear();

      return {
        metrics: Object.values(metricData),
        defaultMetricId,
        defaultYear,
      };
    } catch {
      if (attempt === maxRetries) {
        return null;
      }
      await sleep(400);
    }
  }
  return null;
}

export default async function Home() {
  const mapData: Awaited<ReturnType<typeof loadMapData>> | null = await loadMapData();

  if (!mapData) {
    return (
      <section className="flex h-full w-full flex-col items-center justify-center gap-3 p-6 text-center">
        <h1 className="text-2xl font-semibold text-slate-900">Unable to load data</h1>
        <p className="max-w-xl text-sm text-slate-600">
          The database could not be reached. Please check your Supabase connection and try again.
        </p>
      </section>
    );
  }

  const { metrics, defaultMetricId, defaultYear } = mapData;
  const features = getUSStateFeatures().filter((feature) => {
    const featureStateId =
      feature.properties?.stateId ?? String(feature.id ?? "").padStart(2, "0");
    return !EXCLUDED_STATE_IDS.has(featureStateId);
  });

  return (
    <section className="relative h-full w-full">
      <MapExplorer
        metrics={metrics}
        defaultMetricId={defaultMetricId}
        defaultYear={defaultYear}
        states={mapStates}
        features={features}
      />
    </section>
  );
}
