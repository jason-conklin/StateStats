import { PrismaClient } from "@prisma/client";
import { loadIngestionEnv } from "./ingestion/utils";
import {
  ACS_ONE_YEAR_REAL_WINDOW_CONFIG,
  resolveAcsExpectedWindow,
} from "./ingestion/acsWindow";
import { weatherStateIdSet, WEATHER_EXPECTED_STATE_COUNT } from "./ingestion/weatherStates";

type IngestionRunView = {
  dataSourceId: string;
  details: unknown;
  isSynthetic?: boolean;
  note?: string | null;
};

type ExpectedRealWindow = {
  startYear: number;
  endYear: number;
  excludedYears?: number[];
};

const ACS_METRIC_IDS = new Set([
  "median_household_income",
  "median_home_value",
  "median_age",
  "population_total",
]);

const WEATHER_METRIC_IDS = new Set([
  "average_annual_temperature",
  "annual_precipitation",
  "annual_snowfall",
  "tornado_count",
  "earthquake_count",
]);

const EXPECTED_NON_ACS_WINDOWS: Record<string, ExpectedRealWindow> = {
  unemployment_rate: {
    startYear: 2000,
    endYear: new Date().getFullYear() - 1,
  },
  average_annual_temperature: {
    startYear: 2000,
    endYear: new Date().getFullYear() - 1,
  },
  annual_precipitation: {
    startYear: 2000,
    endYear: new Date().getFullYear() - 1,
  },
  annual_snowfall: {
    startYear: 2000,
    endYear: new Date().getFullYear() - 1,
  },
  tornado_count: {
    startYear: 2000,
    endYear: new Date().getFullYear() - 1,
  },
  earthquake_count: {
    startYear: 2000,
    endYear: new Date().getFullYear() - 1,
  },
};

function readSyntheticMetadata(run: IngestionRunView) {
  const details =
    run.details && typeof run.details === "object" && !Array.isArray(run.details)
      ? (run.details as Record<string, unknown>)
      : null;
  const mode = typeof details?.mode === "string" ? details.mode : null;
  const fallbackReason =
    typeof details?.fallbackReason === "string" ? details.fallbackReason : null;
  const note = typeof run.note === "string" && run.note.trim().length > 0 ? run.note.trim() : null;
  const isSynthetic =
    typeof run.isSynthetic === "boolean"
      ? run.isSynthetic
      : mode === "synthetic_fallback" || run.dataSourceId.toLowerCase().includes("synthetic");

  return {
    isSynthetic,
    note: note ?? fallbackReason ?? "n/a",
  };
}

function buildAllowedYearSet(window: ExpectedRealWindow) {
  const excluded = new Set(window.excludedYears ?? []);
  const years = new Set<number>();
  for (let year = window.startYear; year <= window.endYear; year += 1) {
    if (!excluded.has(year)) {
      years.add(year);
    }
  }
  return years;
}

async function getLatestAcsPlannedEndYear(client: PrismaClient, metricId: string) {
  const latestMetricRun = await client.ingestionRun.findFirst({
    where: {
      dataSourceId: "census_acs",
      status: { in: ["success", "partial"] },
      details: {
        path: ["metricId"],
        equals: metricId,
      },
    },
    orderBy: [{ completedAt: "desc" }, { startedAt: "desc" }],
    select: { details: true },
  });

  if (!latestMetricRun?.details || typeof latestMetricRun.details !== "object") {
    return null;
  }

  const details = latestMetricRun.details as Record<string, unknown>;
  const yearsRaw =
    details.years && typeof details.years === "object" && !Array.isArray(details.years)
      ? (details.years as Record<string, unknown>)
      : null;
  const plannedEndYear =
    yearsRaw && typeof yearsRaw.plannedEndYear === "number" ? yearsRaw.plannedEndYear : null;

  return plannedEndYear;
}

async function getLatestAcsFailedYears(client: PrismaClient, metricId: string) {
  const latestMetricRun = await client.ingestionRun.findFirst({
    where: {
      dataSourceId: "census_acs",
      status: { in: ["success", "partial"] },
      details: {
        path: ["metricId"],
        equals: metricId,
      },
    },
    orderBy: [{ completedAt: "desc" }, { startedAt: "desc" }],
    select: { details: true },
  });

  if (!latestMetricRun?.details || typeof latestMetricRun.details !== "object") {
    return [] as number[];
  }

  const details = latestMetricRun.details as Record<string, unknown>;
  const failedYearsRaw = details.failedYears;
  if (!Array.isArray(failedYearsRaw)) {
    return [] as number[];
  }

  return failedYearsRaw
    .map((value) => Number(value))
    .filter((value) => Number.isInteger(value))
    .sort((a, b) => a - b);
}

async function main() {
  loadIngestionEnv();
  const client = new PrismaClient();

  try {
    console.log("[verifyIngestion] Checking ingestion state...");

    const latestSuccessfulRun = await client.ingestionRun.findFirst({
      where: { status: "success" },
      include: { dataSource: true },
      orderBy: [{ completedAt: "desc" }, { startedAt: "desc" }],
    });

    if (!latestSuccessfulRun) {
      console.log("[verifyIngestion] No successful ingestion runs found.");
    } else {
      const runView = latestSuccessfulRun as unknown as IngestionRunView;
      const syntheticMeta = readSyntheticMetadata(runView);
      const completedAt = latestSuccessfulRun.completedAt?.toISOString() ?? "n/a";
      console.log("[verifyIngestion] Latest successful run:");
      console.log(`  id: ${latestSuccessfulRun.id}`);
      console.log(`  completedAt: ${completedAt}`);
      console.log(`  status: ${latestSuccessfulRun.status}`);
      console.log(`  sourceId: ${latestSuccessfulRun.dataSourceId}`);
      console.log(`  sourceName: ${latestSuccessfulRun.dataSource?.name ?? "n/a"}`);
      console.log(`  isSynthetic: ${syntheticMeta.isSynthetic ? "yes" : "no"}`);
      console.log(`  note: ${syntheticMeta.note}`);
    }

    const overallMaxYear = await client.observation.aggregate({ _max: { year: true } });
    console.log(`  overallDataThroughYear: ${overallMaxYear._max.year ?? "n/a"}`);

    const metrics = await client.metric.findMany({
      include: { source: true },
      orderBy: { id: "asc" },
    });

    const countsByMetric = await client.observation.groupBy({
      by: ["metricId"],
      _count: { _all: true },
      _min: { year: true },
      _max: { year: true },
    });
    const countMap = new Map(
      countsByMetric.map((entry) => [
        entry.metricId,
        {
          count: entry._count._all,
          minYear: entry._min.year,
          maxYear: entry._max.year,
        },
      ]),
    );

    console.log("[verifyIngestion] Per metric coverage:");
    for (const metric of metrics) {
      const stats = countMap.get(metric.id);
      console.log(
        `  ${metric.id}: count=${stats?.count ?? 0}, years=${stats?.minYear ?? "n/a"}-${stats?.maxYear ?? "n/a"}, source=${metric.sourceId}`,
      );

      const distinctYears = await client.observation.findMany({
        where: { metricId: metric.id },
        select: { year: true },
        distinct: ["year"],
      });
      const observedYears = distinctYears.map((row) => row.year).sort((a, b) => a - b);
      const expectedWindow = EXPECTED_NON_ACS_WINDOWS[metric.id];

      if (WEATHER_METRIC_IDS.has(metric.id)) {
        const weatherRows = await client.observation.findMany({
          where: { metricId: metric.id },
          select: { year: true, stateId: true },
        });
        const dcRows = weatherRows.filter((row) => row.stateId === "11");
        if (dcRows.length > 0) {
          console.warn(
            `WARNING: Weather metric ${metric.id} still has ${dcRows.length} District of Columbia observation(s); rerun weather ingestion cleanup.`,
          );
        }

        const coverageByYear = new Map<number, Set<string>>();
        for (const row of weatherRows) {
          if (!weatherStateIdSet.has(row.stateId)) continue;
          const bucket = coverageByYear.get(row.year) ?? new Set<string>();
          bucket.add(row.stateId);
          coverageByYear.set(row.year, bucket);
        }

        for (const [year, stateIds] of Array.from(coverageByYear.entries()).sort((a, b) => a[0] - b[0])) {
          if (stateIds.size < WEATHER_EXPECTED_STATE_COUNT) {
            console.warn(
              `WARNING: Weather metric ${metric.id} year ${year} has ${stateIds.size}/${WEATHER_EXPECTED_STATE_COUNT} states (District of Columbia excluded).`,
            );
          }
          if (stateIds.size > WEATHER_EXPECTED_STATE_COUNT) {
            console.warn(
              `WARNING: Weather metric ${metric.id} year ${year} has ${stateIds.size} states; expected ${WEATHER_EXPECTED_STATE_COUNT} states excluding District of Columbia.`,
            );
          }
        }
      }

      let allowedYears: Set<number> | null = null;
      let expectedWindowLabel: string | null = null;

      if (ACS_METRIC_IDS.has(metric.id)) {
        const latestPlannedEndYear =
          (await getLatestAcsPlannedEndYear(client, metric.id)) ??
          observedYears[observedYears.length - 1] ??
          new Date().getFullYear() - 1;
        const latestFailedYears = await getLatestAcsFailedYears(client, metric.id);
        const acsWindowConfig = {
          ...ACS_ONE_YEAR_REAL_WINDOW_CONFIG,
          excludedYears: Array.from(
            new Set([...ACS_ONE_YEAR_REAL_WINDOW_CONFIG.excludedYears, ...latestFailedYears]),
          ).sort((a, b) => a - b),
        };
        const resolvedAcsWindow = resolveAcsExpectedWindow(
          latestPlannedEndYear,
          acsWindowConfig,
        );
        allowedYears = new Set(resolvedAcsWindow.allowedYears);
        expectedWindowLabel = `${resolvedAcsWindow.startYear}-${resolvedAcsWindow.endYear}${resolvedAcsWindow.excludedYears.length ? ` (excluding ${resolvedAcsWindow.excludedYears.join(",")})` : ""}`;
      } else if (expectedWindow) {
        allowedYears = buildAllowedYearSet(expectedWindow);
        expectedWindowLabel = `${expectedWindow.startYear}-${expectedWindow.endYear}${expectedWindow.excludedYears?.length ? ` (excluding ${expectedWindow.excludedYears.join(",")})` : ""}`;
      }

      if (!allowedYears) {
        continue;
      }

      const unexpectedYears = observedYears.filter((year) => !allowedYears.has(year));

      if (unexpectedYears.length > 0) {
        console.warn(
          `WARNING: Mixed/synthetic legacy rows detected; cleanup required. metric=${metric.id} unexpectedYears=${unexpectedYears.join(",")} expectedWindow=${expectedWindowLabel}`,
        );
      }
    }
  } finally {
    await client.$disconnect();
  }
}

main().catch((error) => {
  console.error("[verifyIngestion] Failed:", error);
  process.exitCode = 1;
});
