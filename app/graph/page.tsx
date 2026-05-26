import { GraphExplorer } from "@/components/graph/GraphExplorer";
import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { states as stateList } from "@/lib/states";
import { ensureCatalog } from "@/lib/metrics";

type QueryParams = { [key: string]: string | string[] | undefined };

const DEFAULT_STATE_ABBRS = ["CA", "TX", "NY", "FL"];
const DEFAULT_METRIC_COMPARISON_IDS = [
  "median_household_income",
  "median_home_value",
  "unemployment_rate",
];
const graphStateList = stateList.filter((state) => state.id !== "11");

export const metadata: Metadata = {
  title: "StateStats - Graph",
};

export const runtime = "nodejs";

function normalizeStateIds(param: string | string[] | undefined) {
  const values = Array.isArray(param) ? param.join(",") : param ?? "";
  const codes = values
    .split(",")
    .map((code) => code.trim().toUpperCase())
    .filter(Boolean);

  const ids = codes
    .map((code) => {
      const match =
        graphStateList.find((state) => state.abbreviation.toUpperCase() === code) ??
        graphStateList.find((state) => state.id === code);
      return match?.id;
    })
    .filter(Boolean) as string[];

  return Array.from(new Set(ids));
}

function normalizeMetricIds(param: string | string[] | undefined, availableMetricIds: Set<string>) {
  const values = Array.isArray(param) ? param.join(",") : param ?? "";
  const ids = values
    .split(",")
    .map((id) => id.trim())
    .filter((id) => availableMetricIds.has(id));

  return Array.from(new Set(ids));
}

function normalizeSingleStateId(param: string | string[] | undefined) {
  const raw = Array.isArray(param) ? param[0] : param;
  const code = raw?.trim().toUpperCase();
  if (!code) return null;

  const match =
    graphStateList.find((state) => state.abbreviation.toUpperCase() === code) ??
    graphStateList.find((state) => state.id === code);

  return match?.id ?? null;
}

async function loadMetricData(metricId: string) {
  const metric = await prisma.metric.findUnique({
    where: { id: metricId },
    include: { source: true },
  });
  if (!metric) return null;

  const observations = await prisma.observation.findMany({
    where: { metricId },
    select: { stateId: true, year: true, value: true },
    orderBy: [{ year: "asc" }],
  });

  const years = Array.from(new Set(observations.map((o) => o.year))).sort((a, b) => a - b);

  const seriesMap = new Map<
    string,
    { stateId: string; stateName: string; points: { year: number; value: number | null }[] }
  >();

  observations.forEach((obs) => {
    if (!seriesMap.has(obs.stateId)) {
      const match = stateList.find((state) => state.id === obs.stateId);
      seriesMap.set(obs.stateId, {
        stateId: obs.stateId,
        stateName: match?.name ?? obs.stateId,
        points: [],
      });
    }
    const entry = seriesMap.get(obs.stateId);
    if (entry) {
      entry.points.push({ year: obs.year, value: obs.value });
    }
  });

  return {
    metric: {
      id: metric.id,
      name: metric.name,
      unit: metric.unit,
      description: metric.description,
      sourceName: metric.source?.name ?? null,
    },
    availableYears: years,
    series: Array.from(seriesMap.values()),
  };
}

async function loadMetricComparisonData(stateId: string, metricIds: string[]) {
  const selectedMetrics = await prisma.metric.findMany({
    where: { id: { in: metricIds } },
    orderBy: { name: "asc" },
  });
  const metricOrder = new Map(metricIds.map((metricId, index) => [metricId, index]));
  const orderedMetrics = selectedMetrics.sort(
    (left, right) => (metricOrder.get(left.id) ?? 0) - (metricOrder.get(right.id) ?? 0),
  );

  const observations = await prisma.observation.findMany({
    where: {
      stateId,
      metricId: { in: metricIds },
    },
    select: { metricId: true, year: true, value: true },
    orderBy: [{ year: "asc" }],
  });

  const years = Array.from(new Set(observations.map((observation) => observation.year))).sort((a, b) => a - b);
  const observationsByMetricId = new Map<string, { year: number; value: number | null }[]>();

  observations.forEach((observation) => {
    const metricObservations = observationsByMetricId.get(observation.metricId) ?? [];
    metricObservations.push({ year: observation.year, value: observation.value });
    observationsByMetricId.set(observation.metricId, metricObservations);
  });

  return {
    availableYears: years,
    series: orderedMetrics.map((metric) => ({
      metricId: metric.id,
      metricName: metric.name,
      unit: metric.unit,
      points: observationsByMetricId.get(metric.id) ?? [],
    })),
  };
}

type GraphPageProps = { searchParams?: Promise<QueryParams> | QueryParams };

export const dynamic = "force-dynamic";

export default async function GraphPage(props: GraphPageProps) {
  try {
    const params: QueryParams = (await Promise.resolve(props.searchParams)) ?? {};

    // Ensure cataloged metrics exist before querying.
    await ensureCatalog(prisma);

    const metrics = await prisma.metric.findMany({ orderBy: { name: "asc" } });
    const availableMetricIds = new Set(metrics.map((metric) => metric.id));
    const modeRaw = params.mode;
    const modeParam = Array.isArray(modeRaw) ? modeRaw[0] : modeRaw;
    const comparisonMode = modeParam === "metrics" ? "metrics" : "states";
    const fallbackMetricId =
      metrics.find((m) => m.id === "median_household_income")?.id ??
      metrics.find((m) => m.isDefault)?.id ??
      metrics[0]?.id;
    const metricRaw = params.metric;
    const metricParam = Array.isArray(metricRaw) ? metricRaw[0] : metricRaw;
    const requestedMetric = typeof metricParam === "string" ? metricParam : undefined;
    const selectedMetricId = metrics.find((m) => m.id === requestedMetric)?.id ?? fallbackMetricId;

    if (!selectedMetricId) {
      return (
        <section className="space-y-4">
          <h1 className="text-2xl font-semibold text-slate-900">Compare trends over time</h1>
          <p className="text-slate-600">No metrics are available. Please ingest data first.</p>
        </section>
      );
    }

    const statesRaw = params.states;
    const statesParam = Array.isArray(statesRaw) ? statesRaw.join(",") : statesRaw;
    const requestedStates = normalizeStateIds(typeof statesParam === "string" ? statesParam : undefined);
    const defaultStates = DEFAULT_STATE_ABBRS.map(
      (abbr) => graphStateList.find((s) => s.abbreviation === abbr)?.id,
    ).filter(Boolean) as string[];
    const selectedStates = requestedStates.length > 0 ? requestedStates : defaultStates;
    const stateRaw = params.state;
    const selectedStateId =
      normalizeSingleStateId(stateRaw) ??
      selectedStates[0] ??
      graphStateList.find((state) => state.abbreviation === "CA")?.id ??
      graphStateList[0]?.id;
    const requestedMetricIds = normalizeMetricIds(params.metrics, availableMetricIds);
    const defaultMetricIds = DEFAULT_METRIC_COMPARISON_IDS.filter((metricId) => availableMetricIds.has(metricId));
    const selectedMetricIds = requestedMetricIds.length > 0 ? requestedMetricIds : defaultMetricIds;
    const selectedMetricUnitKeys = new Set(
      selectedMetricIds
        .map((metricId) => metrics.find((metric) => metric.id === metricId)?.unit?.trim().toLowerCase() ?? "")
        .filter(Boolean),
    );
    const canUseRawMetricComparison = selectedMetricIds.length > 0 && selectedMetricUnitKeys.size === 1;
    const metricData = comparisonMode === "states" ? await loadMetricData(selectedMetricId) : null;
    const metricComparisonData =
      comparisonMode === "metrics" && selectedStateId
        ? await loadMetricComparisonData(selectedStateId, selectedMetricIds)
        : null;

    const availableYears =
      comparisonMode === "metrics"
        ? metricComparisonData?.availableYears ?? []
        : metricData?.availableYears ?? [];
    const defaultStart = availableYears[0] ?? new Date().getFullYear();
    const defaultEnd = availableYears[availableYears.length - 1] ?? defaultStart;

    const startYearRaw = params.startYear;
    const endYearRaw = params.endYear;
    const startYearParamRaw = Array.isArray(startYearRaw) ? startYearRaw[0] : startYearRaw;
    const endYearParamRaw = Array.isArray(endYearRaw) ? endYearRaw[0] : endYearRaw;
    const startYearParam = startYearParamRaw ? Number(startYearParamRaw) : undefined;
    const endYearParam = endYearParamRaw ? Number(endYearParamRaw) : undefined;

    const startYear = startYearParam && availableYears.includes(startYearParam) ? startYearParam : defaultStart;
    const endYear = endYearParam && availableYears.includes(endYearParam) ? endYearParam : defaultEnd;

    const normalizationRaw = params.normalization;
    const normalizationParam = Array.isArray(normalizationRaw) ? normalizationRaw[0] : normalizationRaw;
    const requestedNormalization =
      normalizationParam === "indexed" || normalizationParam === "raw" ? normalizationParam : null;
    const legacyNormalization = modeParam === "indexed" ? "indexed" : modeParam === "raw" ? "raw" : null;
    const normalizationPreference = requestedNormalization ?? legacyNormalization;
    const normalization =
      comparisonMode === "metrics"
        ? canUseRawMetricComparison
          ? normalizationPreference ?? "raw"
          : "indexed"
        : normalizationPreference === "indexed"
          ? "indexed"
          : "raw";

    return (
      <div className="min-h-[100svh] w-full overflow-y-auto bg-sky-50 p-4 pb-[calc(5rem+env(safe-area-inset-bottom))] md:h-full md:min-h-0 md:bg-slate-950 md:bg-opacity-90 md:p-6">
        <section className="space-y-4 md:space-y-6">
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
              Compare
            </p>
            <h1 className="text-2xl md:text-3xl font-semibold leading-tight text-slate-900 md:text-white">
              Compare trends over time
            </h1>
            <p className="text-slate-700 md:text-slate-300">
              Compare states across one metric, or compare multiple metrics for a single state.
            </p>
          </div>
          <div className="h-auto overflow-visible rounded-2xl border border-slate-200 bg-white p-4 shadow-md md:min-h-[calc(100vh-13rem)] md:overflow-visible md:border-slate-700 md:bg-slate-900 md:shadow-lg xl:min-h-[calc(100vh-12rem)]">
            <GraphExplorer
              metrics={metrics.map((m) => ({
                id: m.id,
                name: m.name,
                unit: m.unit,
                category: m.category,
                description: m.description,
              }))}
              states={graphStateList}
              initialMode={comparisonMode}
              initialMetricId={selectedMetricId}
              initialSelectedStates={selectedStates}
              initialSelectedStateId={selectedStateId ?? graphStateList[0]?.id ?? ""}
              initialSelectedMetricIds={selectedMetricIds}
              availableYears={availableYears}
              initialYearRange={{ start: startYear, end: endYear }}
              initialNormalization={normalization === "indexed" ? "indexed" : "raw"}
              initialStateSeries={metricData?.series ?? []}
              initialMetricSeries={metricComparisonData?.series ?? []}
            />
          </div>
        </section>
      </div>
    );
  } catch (error) {
    console.error("Graph page error:", error);
    return (
      <div className="h-full w-full overflow-y-auto p-6">
        <section className="space-y-4">
          <h1 className="text-2xl font-semibold text-slate-900">Compare trends over time</h1>
          <p className="text-slate-600">Unable to load data for this view. Please try again later.</p>
        </section>
      </div>
    );
  }
}
