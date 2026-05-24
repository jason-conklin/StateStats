import { DEFAULT_YEAR_RANGE } from "../config";
import { weatherStates } from "../weatherStates";
import { buildCoverageByYear, roundTo, type WeatherProviderResult } from "../weatherTypes";
import { fetchJsonWithRetry } from "./http";

const CAG_BASE_URL = "https://www.ncei.noaa.gov/access/monitoring/climate-at-a-glance/statewide/time-series";
const ANNUAL_TIMESCALE = 12;
const DECEMBER_END_MONTH = 12;

type ClimateAtAGlanceParameter = "tavg" | "pcp";

type ClimateAtAGlancePayload = {
  data?: Record<string, unknown>;
};

const CAG_STATE_CODES_BY_FIPS: Record<string, number> = {
  "01": 1,
  "04": 2,
  "05": 3,
  "06": 4,
  "08": 5,
  "09": 6,
  "10": 7,
  "12": 8,
  "13": 9,
  "16": 10,
  "17": 11,
  "18": 12,
  "19": 13,
  "20": 14,
  "21": 15,
  "22": 16,
  "23": 17,
  "24": 18,
  "25": 19,
  "26": 20,
  "27": 21,
  "28": 22,
  "29": 23,
  "30": 24,
  "31": 25,
  "32": 26,
  "33": 27,
  "34": 28,
  "35": 29,
  "36": 30,
  "37": 31,
  "38": 32,
  "39": 33,
  "40": 34,
  "41": 35,
  "42": 36,
  "44": 37,
  "45": 38,
  "46": 39,
  "47": 40,
  "48": 41,
  "49": 42,
  "50": 43,
  "51": 44,
  "53": 45,
  "54": 46,
  "55": 47,
  "56": 48,
  "02": 50,
  "15": 51,
};

export type FetchClimateAtAGlanceOptions = {
  metricId: string;
  parameter: ClimateAtAGlanceParameter;
  startYear?: number;
  endYear?: number;
  noaaToken: string;
  logPrefix: string;
};

function extractNumericValue(rawValue: unknown): number | null {
  if (typeof rawValue === "number") return Number.isFinite(rawValue) ? rawValue : null;
  if (typeof rawValue === "string") {
    const parsed = Number(rawValue.trim());
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (rawValue && typeof rawValue === "object") {
    const candidate = (rawValue as { value?: unknown }).value;
    return extractNumericValue(candidate);
  }
  return null;
}

function yearFromPeriodKey(key: string) {
  const match = key.match(/^(\d{4})/);
  return match ? Number(match[1]) : null;
}

export async function fetchClimateAtAGlanceStateSeries(
  options: FetchClimateAtAGlanceOptions,
): Promise<WeatherProviderResult> {
  const startYear = options.startYear ?? DEFAULT_YEAR_RANGE.start;
  const endYear = options.endYear ?? DEFAULT_YEAR_RANGE.end;
  const observations: WeatherProviderResult["observations"] = [];
  const warnings: string[] = [];
  const failedStates: string[] = [];
  let skippedRows = 0;

  if (!options.noaaToken.trim()) {
    throw new Error(`${options.logPrefix} Missing NOAA_CDO_TOKEN.`);
  }

  for (const state of weatherStates) {
    const locationCode = CAG_STATE_CODES_BY_FIPS[state.id];
    if (!locationCode) {
      warnings.push(`${options.logPrefix} Missing Climate at a Glance state code for ${state.name} (${state.id}).`);
      continue;
    }

    const url = `${CAG_BASE_URL}/${locationCode}/${options.parameter}/${ANNUAL_TIMESCALE}/${DECEMBER_END_MONTH}/${startYear}-${endYear}/data.json?base_prd=false`;

    try {
      const payload = await fetchJsonWithRetry<ClimateAtAGlancePayload>(
        url,
        { headers: { token: options.noaaToken } },
        { logPrefix: options.logPrefix, rateLimitDelayMs: 80 },
      );

      const data = payload.data;
      if (!data || typeof data !== "object") {
        warnings.push(`${options.logPrefix} No data payload for ${state.name}.`);
        failedStates.push(state.id);
        continue;
      }

      for (const [periodKey, rawValue] of Object.entries(data)) {
        const year = yearFromPeriodKey(periodKey);
        const value = extractNumericValue(rawValue);
        if (!year || year < startYear || year > endYear || value === null) {
          skippedRows += 1;
          continue;
        }

        observations.push({
          metricId: options.metricId,
          stateId: state.id,
          year,
          value: roundTo(value, 1),
        });
      }
    } catch (error) {
      failedStates.push(state.id);
      warnings.push(`${options.logPrefix} Failed ${state.name}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  const years = Array.from(new Set(observations.map((row) => row.year))).sort((a, b) => a - b);

  return {
    observations,
    years,
    coverageByYear: buildCoverageByYear(observations),
    warnings,
    failedYears: [],
    skippedYears: [],
    skippedRows,
    details: {
      provider: "NOAA Climate at a Glance Statewide Time Series",
      parameter: options.parameter,
      startYear,
      endYear,
      failedStates,
      endpointPattern: `${CAG_BASE_URL}/{stateCode}/${options.parameter}/12/12/${startYear}-${endYear}/data.json`,
    },
  };
}
