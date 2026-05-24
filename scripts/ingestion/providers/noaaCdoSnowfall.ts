import { DEFAULT_YEAR_RANGE } from "../config";
import { weatherStates } from "../weatherStates";
import { buildCoverageByYear, roundTo, type WeatherProviderResult } from "../weatherTypes";
import { fetchJsonWithRetry } from "./http";

const CDO_DATA_URL = "https://www.ncei.noaa.gov/cdo-web/api/v2/data";
const CDO_DATASET_ID = "GSOY";
const CDO_SNOW_DATATYPE = "SNOW";
const CDO_LIMIT = 1000;
const MIN_REPORTING_STATIONS = 3;
const CDO_RATE_LIMIT_DELAY_MS = 230;

type CdoDatum = {
  datatype?: string;
  station?: string;
  date?: string;
  value?: number | string;
};

type CdoPayload = {
  metadata?: {
    resultset?: {
      count?: number;
      limit?: number;
      offset?: number;
    };
  };
  results?: CdoDatum[];
};

export type FetchNoaaCdoSnowfallOptions = {
  metricId: string;
  noaaToken: string;
  startYear?: number;
  endYear?: number;
  logPrefix: string;
};

function parseValue(value: unknown) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const parsed = Number(value.trim());
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

async function fetchSnowRowsForStateYear(stateId: string, year: number, token: string, logPrefix: string) {
  const values: number[] = [];
  let offset = 1;
  let expectedCount: number | null = null;

  while (expectedCount === null || offset <= expectedCount) {
    const params = new URLSearchParams({
      datasetid: CDO_DATASET_ID,
      locationid: `FIPS:${stateId}`,
      datatypeid: CDO_SNOW_DATATYPE,
      units: "standard",
      startdate: `${year}-01-01`,
      enddate: `${year}-12-31`,
      includemetadata: "true",
      limit: String(CDO_LIMIT),
      offset: String(offset),
    });

    const payload = await fetchJsonWithRetry<CdoPayload>(
      `${CDO_DATA_URL}?${params.toString()}`,
      { headers: { token } },
      { logPrefix, rateLimitDelayMs: CDO_RATE_LIMIT_DELAY_MS },
    );

    expectedCount = payload.metadata?.resultset?.count ?? payload.results?.length ?? 0;
    const results = payload.results ?? [];

    for (const row of results) {
      if (row.datatype !== CDO_SNOW_DATATYPE) continue;
      const value = parseValue(row.value);
      if (value === null || value < 0) continue;
      values.push(value);
    }

    if (results.length < CDO_LIMIT) break;
    offset += CDO_LIMIT;
  }

  return values;
}

export async function fetchNoaaCdoAnnualSnowfall(
  options: FetchNoaaCdoSnowfallOptions,
): Promise<WeatherProviderResult> {
  const startYear = options.startYear ?? DEFAULT_YEAR_RANGE.start;
  const endYear = options.endYear ?? DEFAULT_YEAR_RANGE.end;
  const observations: WeatherProviderResult["observations"] = [];
  const warnings: string[] = [];
  const unsupportedStateYears: string[] = [];
  const stationCountsByYear: Record<number, Record<string, number>> = {};
  let skippedRows = 0;

  if (!options.noaaToken.trim()) {
    throw new Error(`${options.logPrefix} Missing NOAA_CDO_TOKEN.`);
  }

  for (let year = startYear; year <= endYear; year += 1) {
    console.log(`${options.logPrefix} Fetching NOAA CDO GSOY SNOW year=${year}...`);
    for (const state of weatherStates) {
      try {
        const values = await fetchSnowRowsForStateYear(state.id, year, options.noaaToken, options.logPrefix);
        stationCountsByYear[year] = stationCountsByYear[year] ?? {};
        stationCountsByYear[year][state.id] = values.length;

        if (values.length < MIN_REPORTING_STATIONS) {
          unsupportedStateYears.push(`${state.abbreviation}:${year}`);
          skippedRows += 1;
          continue;
        }

        const average = values.reduce((sum, value) => sum + value, 0) / values.length;
        observations.push({
          metricId: options.metricId,
          stateId: state.id,
          year,
          value: roundTo(average, 1),
        });
      } catch (error) {
        unsupportedStateYears.push(`${state.abbreviation}:${year}`);
        warnings.push(`${options.logPrefix} Failed ${state.name} ${year}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  if (unsupportedStateYears.length > 0) {
    warnings.push(
      `${options.logPrefix} Skipped ${unsupportedStateYears.length} state-year(s) with fewer than ${MIN_REPORTING_STATIONS} NOAA GSOY SNOW reporting stations.`,
    );
  }

  const years = Array.from(new Set(observations.map((row) => row.year))).sort((a, b) => a - b);

  return {
    observations,
    years,
    coverageByYear: buildCoverageByYear(observations),
    warnings,
    skippedRows,
    failedYears: [],
    skippedYears: [],
    details: {
      provider: "NOAA Climate Data Online GSOY",
      datasetId: CDO_DATASET_ID,
      datatypeId: CDO_SNOW_DATATYPE,
      aggregation: "Average of reporting NOAA GSOY station annual snowfall values by state-year",
      minimumReportingStations: MIN_REPORTING_STATIONS,
      startYear,
      endYear,
      unsupportedStateYears: unsupportedStateYears.slice(0, 500),
      unsupportedStateYearCount: unsupportedStateYears.length,
      stationCountsByYear,
    },
  };
}
