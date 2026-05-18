import { GraphExplorer } from "@/components/graph/GraphExplorer";
import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { states as stateList } from "@/lib/states";
import { ensureCatalog } from "@/lib/metrics";

type QueryParams = { [key: string]: string | string[] | undefined };

const DEFAULT_STATE_ABBRS = ["CA", "TX", "NY", "FL"];
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

type GraphPageProps = { searchParams?: Promise<QueryParams> | QueryParams };

export const dynamic = "force-dynamic";

export default async function GraphPage(props: GraphPageProps) {
  try {
    const params: QueryParams = (await Promise.resolve(props.searchParams)) ?? {};

    // Ensure cataloged metrics exist before querying.
    await ensureCatalog(prisma);

    const metrics = await prisma.metric.findMany({ orderBy: { name: "asc" } });
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
          <h1 className="text-2xl font-semibold text-slate-900">Compare states over time</h1>
          <p className="text-slate-600">No metrics are available. Please ingest data first.</p>
        </section>
      );
    }

    const metricData = await loadMetricData(selectedMetricId);

    const availableYears = metricData?.availableYears ?? [];
    const defaultStart = availableYears[0] ?? new Date().getFullYear();
    const defaultEnd = availableYears[availableYears.length - 1] ?? defaultStart;

    const statesRaw = params.states;
    const statesParam = Array.isArray(statesRaw) ? statesRaw.join(",") : statesRaw;
    const requestedStates = normalizeStateIds(typeof statesParam === "string" ? statesParam : undefined);
    const defaultStates = DEFAULT_STATE_ABBRS.map(
      (abbr) => graphStateList.find((s) => s.abbreviation === abbr)?.id,
    ).filter(Boolean) as string[];
    const selectedStates = requestedStates.length > 0 ? requestedStates : defaultStates;

    const startYearRaw = params.startYear;
    const endYearRaw = params.endYear;
    const startYearParamRaw = Array.isArray(startYearRaw) ? startYearRaw[0] : startYearRaw;
    const endYearParamRaw = Array.isArray(endYearRaw) ? endYearRaw[0] : endYearRaw;
    const startYearParam = startYearParamRaw ? Number(startYearParamRaw) : undefined;
    const endYearParam = endYearParamRaw ? Number(endYearParamRaw) : undefined;

    const startYear =
      startYearParam && availableYears.includes(startYearParam) ? startYearParam : defaultStart;
    const endYear =
      endYearParam && availableYears.includes(endYearParam) ? endYearParam : defaultEnd;

    const modeRaw = params.mode;
    const modeParam = Array.isArray(modeRaw) ? modeRaw[0] : modeRaw;
    const normalization = modeParam === "indexed" ? "indexed" : "raw";

    return (
      <div className="min-h-[100svh] w-full overflow-y-auto bg-sky-50 p-4 pb-[calc(5rem+env(safe-area-inset-bottom))] md:h-full md:min-h-0 md:bg-slate-950 md:bg-opacity-90 md:p-6">
        <section className="space-y-4 md:space-y-6">
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
              Compare
            </p>
            <h1 className="text-2xl md:text-3xl font-semibold leading-tight text-slate-900 md:text-white">
              Compare states over time
            </h1>
            <p className="text-slate-700 md:text-slate-300">
              Select a metric, pick states, and explore trends across years. Use indexed mode to
              compare relative changes.
            </p>
          </div>
          <div className="h-auto overflow-visible rounded-2xl border border-slate-200 bg-white p-4 shadow-md md:h-[70vh] md:overflow-hidden md:border-slate-700 md:bg-slate-900 md:shadow-lg">
            <GraphExplorer
              metrics={metrics.map((m) => ({
                id: m.id,
                name: m.name,
                unit: m.unit,
                description: m.description,
              }))}
              states={graphStateList}
              initialMetricId={selectedMetricId}
              initialSelectedStates={selectedStates}
              availableYears={availableYears}
              initialYearRange={{ start: startYear, end: endYear }}
              initialNormalization={normalization === "indexed" ? "indexed" : "raw"}
              initialSeries={metricData?.series ?? []}
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
          <h1 className="text-2xl font-semibold text-slate-900">Compare states over time</h1>
          <p className="text-slate-600">Unable to load data for this view. Please try again later.</p>
        </section>
      </div>
    );
  }
}
