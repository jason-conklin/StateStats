import { gunzipSync } from "node:zlib";
import { DEFAULT_YEAR_RANGE } from "../config";
import { weatherStates, weatherStateIdSet } from "../weatherStates";
import { buildCoverageByYear, type WeatherProviderResult } from "../weatherTypes";
import { fetchArrayBufferWithRetry, fetchTextWithRetry } from "./http";

const STORM_EVENTS_BULK_BASE_URL = "https://www.ncei.noaa.gov/pub/data/swdi/stormevents/csvfiles";
const DETAILS_FILE_PATTERN = /StormEvents_details-ftp_v1\.0_d(\d{4})_c\d+\.csv\.gz/g;
const TORNADO_EVENT_TYPE = "tornado";

type CsvRow = Record<string, string>;

export type FetchNoaaStormEventsOptions = {
  metricId: string;
  startYear?: number;
  endYear?: number;
  logPrefix: string;
};

function parseCsv(text: string): CsvRow[] {
  const rows: string[][] = [];
  let currentField = "";
  let currentRow: string[] = [];
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const nextChar = text[index + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        currentField += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      currentRow.push(currentField);
      currentField = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && nextChar === "\n") {
        index += 1;
      }
      currentRow.push(currentField);
      currentField = "";
      if (currentRow.some((field) => field.length > 0)) {
        rows.push(currentRow);
      }
      currentRow = [];
      continue;
    }

    currentField += char;
  }

  if (currentField.length > 0 || currentRow.length > 0) {
    currentRow.push(currentField);
    rows.push(currentRow);
  }

  const [header, ...dataRows] = rows;
  if (!header) return [];
  const normalizedHeader = header.map((field) => field.trim().toUpperCase());

  return dataRows.map((row) => {
    const output: CsvRow = {};
    normalizedHeader.forEach((field, index) => {
      output[field] = row[index]?.trim() ?? "";
    });
    return output;
  });
}

function getStateId(rawValue: string | undefined) {
  if (!rawValue) return null;
  const parsed = Number(rawValue);
  if (!Number.isInteger(parsed)) return null;
  return String(parsed).padStart(2, "0");
}

async function discoverStormEventFiles(logPrefix: string) {
  const listing = await fetchTextWithRetry(`${STORM_EVENTS_BULK_BASE_URL}/`, {}, { logPrefix });
  const filesByYear = new Map<number, string>();
  let match: RegExpExecArray | null;

  while ((match = DETAILS_FILE_PATTERN.exec(listing)) !== null) {
    const year = Number(match[1]);
    const filename = match[0];
    filesByYear.set(year, filename);
  }

  return filesByYear;
}

export async function fetchNoaaTornadoCounts(
  options: FetchNoaaStormEventsOptions,
): Promise<WeatherProviderResult> {
  const startYear = options.startYear ?? DEFAULT_YEAR_RANGE.start;
  const endYear = options.endYear ?? DEFAULT_YEAR_RANGE.end;
  const observations: WeatherProviderResult["observations"] = [];
  const warnings: string[] = [];
  const failedYears: number[] = [];
  const skippedYears: number[] = [];
  let skippedRows = 0;

  const filesByYear = await discoverStormEventFiles(options.logPrefix);

  for (let year = startYear; year <= endYear; year += 1) {
    const filename = filesByYear.get(year);
    if (!filename) {
      skippedYears.push(year);
      warnings.push(`${options.logPrefix} No Storm Events details bulk CSV file found for ${year}; skipping.`);
      continue;
    }

    console.log(`${options.logPrefix} Fetching NOAA Storm Events tornado details year=${year}...`);
    try {
      const buffer = await fetchArrayBufferWithRetry(
        `${STORM_EVENTS_BULK_BASE_URL}/${filename}`,
        {},
        { logPrefix: options.logPrefix, rateLimitDelayMs: 120 },
      );
      const csvText = gunzipSync(Buffer.from(buffer)).toString("utf8");
      const rows = parseCsv(csvText);
      const eventIdsByState = new Map<string, Set<string>>();

      for (const row of rows) {
        if (row.EVENT_TYPE?.trim().toLowerCase() !== TORNADO_EVENT_TYPE) continue;
        const stateId = getStateId(row.STATE_FIPS);
        if (!stateId || !weatherStateIdSet.has(stateId)) {
          skippedRows += 1;
          continue;
        }

        const eventId = row.EVENT_ID?.trim();
        if (!eventId) {
          skippedRows += 1;
          continue;
        }

        const bucket = eventIdsByState.get(stateId) ?? new Set<string>();
        bucket.add(eventId);
        eventIdsByState.set(stateId, bucket);
      }

      for (const state of weatherStates) {
        observations.push({
          metricId: options.metricId,
          stateId: state.id,
          year,
          value: eventIdsByState.get(state.id)?.size ?? 0,
        });
      }
    } catch (error) {
      failedYears.push(year);
      warnings.push(`${options.logPrefix} Failed Storm Events ${year}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  const years = Array.from(new Set(observations.map((row) => row.year))).sort((a, b) => a - b);

  return {
    observations,
    years,
    coverageByYear: buildCoverageByYear(observations),
    warnings,
    failedYears,
    skippedYears,
    skippedRows,
    details: {
      provider: "NOAA Storm Events Database bulk CSV",
      eventType: "Tornado",
      countStrategy: "Distinct EVENT_ID per state-year",
      startYear,
      endYear,
      failedYears,
      skippedYears,
    },
  };
}
