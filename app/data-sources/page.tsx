import { prisma } from "@/lib/db";
import type { Metadata } from "next";
import { formatDateTime } from "@/lib/format";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const metadata: Metadata = {
  title: "StateStats - Data Sources",
};

const SOURCE_LINK_OVERRIDES: Record<string, string> = {
  census_acs: "https://www.census.gov/programs-surveys/acs.html",
  bls_laus: "https://www.bls.gov/lau/",
  noaa_climate_at_a_glance: "https://www.ncei.noaa.gov/access/monitoring/climate-at-a-glance/",
  noaa_cdo: "https://www.ncei.noaa.gov/cdo-web/",
  noaa_storm_events: "https://www.ncei.noaa.gov/stormevents/",
  usgs_earthquake_catalog: "https://earthquake.usgs.gov/earthquakes/search/",
};

const SYNTHETIC_SOURCE_COUNTERPARTS: Record<string, string> = {
  census_acs_synthetic: "census_acs",
  bls_unemployment_rate_synthetic: "bls_laus",
};

const SOURCE_DISPLAY_PRIORITY: Record<string, number> = {
  census_acs: 0,
  census_acs_synthetic: 1,
  bls_laus: 2,
  bls_unemployment_rate_synthetic: 3,
  noaa_climate_at_a_glance: 4,
  noaa_cdo: 5,
  noaa_storm_events: 6,
  usgs_earthquake_catalog: 7,
};

function sortSourcesByPriority<T extends { id: string; name: string }>(sources: T[]) {
  return [...sources].sort((left, right) => {
    const leftPriority = SOURCE_DISPLAY_PRIORITY[left.id] ?? Number.MAX_SAFE_INTEGER;
    const rightPriority = SOURCE_DISPLAY_PRIORITY[right.id] ?? Number.MAX_SAFE_INTEGER;

    if (leftPriority !== rightPriority) {
      return leftPriority - rightPriority;
    }

    const leftIsSynthetic = left.id.endsWith("_synthetic");
    const rightIsSynthetic = right.id.endsWith("_synthetic");

    if (leftIsSynthetic !== rightIsSynthetic) {
      return leftIsSynthetic ? 1 : -1;
    }

    return left.name.localeCompare(right.name);
  });
}

type LatestRunSummary = {
  dataSourceId: string;
  completedAt: Date | null;
  startedAt: Date;
};

function getRunTimestamp(run: LatestRunSummary | undefined) {
  return run?.completedAt ?? run?.startedAt ?? null;
}

function shouldShowSourceCard(
  sourceId: string,
  latestRunBySourceId: Map<string, LatestRunSummary>,
) {
  if (!sourceId.endsWith("_synthetic")) return true;

  const syntheticRun = latestRunBySourceId.get(sourceId);
  if (!syntheticRun) return false;

  const counterpartSourceId = SYNTHETIC_SOURCE_COUNTERPARTS[sourceId];
  if (!counterpartSourceId) return true;

  const counterpartRun = latestRunBySourceId.get(counterpartSourceId);
  const syntheticTimestamp = getRunTimestamp(syntheticRun);
  const counterpartTimestamp = getRunTimestamp(counterpartRun);

  if (!syntheticTimestamp) return false;
  if (!counterpartTimestamp) return true;

  return syntheticTimestamp >= counterpartTimestamp;
}

export default async function DataSourcesPage() {
  const dataSources = await prisma.dataSource.findMany({
    include: {
      ingestionRuns: {
        where: { status: "success" },
        orderBy: { completedAt: "desc" },
        take: 1,
      },
      _count: {
        select: { metrics: true },
      },
    },
    orderBy: { name: "asc" },
  });
  const latestCompletedRuns = await prisma.ingestionRun.findMany({
    where: {
      status: { in: ["success", "partial"] },
    },
    select: {
      dataSourceId: true,
      completedAt: true,
      startedAt: true,
    },
    orderBy: [{ completedAt: "desc" }, { startedAt: "desc" }],
  });

  const latestRunBySourceId = new Map<string, LatestRunSummary>();
  latestCompletedRuns.forEach((run) => {
    if (!latestRunBySourceId.has(run.dataSourceId)) {
      latestRunBySourceId.set(run.dataSourceId, run);
    }
  });

  const visibleDataSources = sortSourcesByPriority(dataSources).filter((source) =>
    shouldShowSourceCard(source.id, latestRunBySourceId),
  );

  const metrics = await prisma.metric.findMany({
    include: { source: true },
    orderBy: { name: "asc" },
  });

  return (
    <main className="h-full w-full overflow-y-auto bg-sky-50 px-4 py-8 md:bg-slate-950 md:px-8 md:py-12">
      <section className="space-y-4 md:space-y-8">
        <div className="space-y-1 md:space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Data sources</p>
          <h1 className="text-2xl md:text-3xl font-semibold leading-tight text-slate-900 md:text-white">Pipelines and providers</h1>
          <p className="max-w-3xl text-sm text-slate-700 md:text-slate-300">
            See where each metric originates, when it last ingested, and which metrics are powered by each source.
          </p>
        </div>

        <div className="space-y-3 md:space-y-4">
          <h2 className="text-lg md:text-xl font-semibold text-slate-900 md:text-white">Sources</h2>
          <div className="grid gap-3 md:gap-4 lg:grid-cols-2">
            {visibleDataSources.map((source) => {
              const lastRun = source.ingestionRuns[0];
              const isSyntheticFallback = source.id.endsWith("_synthetic");
              return (
                <div
                  key={source.id}
                  id={`source-${source.id}`}
                  className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-6 md:bg-slate-900 md:border-slate-800"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h3 className="text-base md:text-lg font-semibold text-slate-900 md:text-white">{source.name}</h3>
                      <p className="text-xs text-slate-500 md:text-slate-400">{source.id}</p>
                    </div>
                    <div className="flex flex-wrap gap-3 text-xs text-[color:var(--ss-green)]">
                      {source.homepageUrl && (
                        <a href={source.homepageUrl} target="_blank" rel="noreferrer" className="hover:underline">
                          Homepage
                        </a>
                      )}
                      {source.apiDocsUrl && (
                        <a href={source.apiDocsUrl} target="_blank" rel="noreferrer" className="hover:underline">
                          API docs
                        </a>
                      )}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <p className="text-sm text-slate-700 md:text-slate-300">
                      {source.description ?? "No description provided."}
                    </p>
                    {isSyntheticFallback ? (
                      <p className="text-xs text-amber-700 md:text-amber-300">
                        Used only when API keys are missing.
                      </p>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600 md:text-slate-400">
                    <span className="rounded-full bg-[color:var(--ss-green-light)] px-3 py-1 text-[color:var(--ss-green-dark)]">
                      Metrics: {source._count.metrics}
                    </span>
                    <span className="rounded-full bg-slate-100 px-3 py-1 md:bg-slate-800 md:text-slate-200">
                      Last success: {lastRun?.completedAt ? formatDateTime(lastRun.completedAt) : "—"}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

      <div className="space-y-3 md:space-y-4">
        <h2 className="text-lg md:text-xl font-semibold text-slate-900 md:text-white">Metrics</h2>
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm md:bg-slate-900 md:border-slate-800">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-600 md:bg-slate-800 md:text-slate-200">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3">Unit</th>
                <th className="px-4 py-3">Source</th>
                <th className="px-4 py-3">Description</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 md:divide-slate-800">
              {metrics.map((metric) => (
                <tr key={metric.id} className="hover:bg-slate-50 md:hover:bg-slate-800">
                  <td className="px-4 py-3 font-semibold text-slate-900 md:text-white">{metric.name}</td>
                  <td className="px-4 py-3 text-slate-700 md:text-slate-300">{metric.category}</td>
                  <td className="px-4 py-3 text-slate-700 md:text-slate-300">{metric.unit}</td>
                  <td className="px-4 py-3 text-slate-700 md:text-slate-300">
                    {metric.source ? (
                      (() => {
                        const sourceLink =
                          SOURCE_LINK_OVERRIDES[metric.sourceId] ??
                          metric.source.homepageUrl ??
                          `#source-${metric.sourceId}`;
                        const isExternal = sourceLink.startsWith("http");

                        return (
                          <a
                            className="text-[color:var(--ss-green)] hover:underline"
                            href={sourceLink}
                            title={metric.source.name}
                            target={isExternal ? "_blank" : undefined}
                            rel={isExternal ? "noreferrer" : undefined}
                          >
                            {metric.source.name}
                          </a>
                        );
                      })()
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-600 md:text-slate-300">
                    {metric.description ?? <span className="text-slate-400 md:text-slate-500">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
    </main>
  );
}
