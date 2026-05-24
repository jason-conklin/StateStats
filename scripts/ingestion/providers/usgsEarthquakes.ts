import { geoContains, GeoPermissibleObjects } from "d3-geo";
import { Feature, Geometry } from "geojson";
import { getUSStateFeatures } from "../../../lib/mapData";
import { DEFAULT_YEAR_RANGE } from "../config";
import { weatherStates, weatherStateIdSet } from "../weatherStates";
import { buildCoverageByYear, type WeatherProviderResult } from "../weatherTypes";
import { fetchJsonWithRetry } from "./http";

const USGS_EVENT_QUERY_URL = "https://earthquake.usgs.gov/fdsnws/event/1/query";
const MIN_MAGNITUDE = 2.5;
const PAGE_LIMIT = 20_000;
const USGS_QUERY_REGIONS = [
  {
    label: "contiguous-us-alaska-hawaii",
    minlatitude: 18,
    maxlatitude: 72,
    minlongitude: -180,
    maxlongitude: -64,
  },
  {
    label: "western-aleutians",
    minlatitude: 50,
    maxlatitude: 58,
    minlongitude: 170,
    maxlongitude: 180,
  },
] as const;

type UsgsFeature = {
  id?: string;
  type?: string;
  properties?: {
    mag?: number | null;
    type?: string | null;
    time?: number | null;
  };
  geometry?: {
    type?: string;
    coordinates?: [number, number, number?];
  };
};

type UsgsGeoJsonPayload = {
  type?: string;
  metadata?: {
    count?: number;
  };
  features?: UsgsFeature[];
};

export type FetchUsgsEarthquakeOptions = {
  metricId: string;
  startYear?: number;
  endYear?: number;
  logPrefix: string;
};

type StateFeature = Feature<Geometry, { stateId?: string; name?: string; abbreviation?: string }>;

function yearRange(year: number) {
  const start = new Date(Date.UTC(year, 0, 1));
  const end = new Date(Date.UTC(year + 1, 0, 1));
  return {
    starttime: start.toISOString().slice(0, 10),
    endtime: end.toISOString().slice(0, 10),
  };
}

function stateIdForPoint(features: StateFeature[], longitude: number, latitude: number) {
  for (const feature of features) {
    if (geoContains(feature as unknown as GeoPermissibleObjects, [longitude, latitude])) {
      return feature.properties?.stateId ?? String(feature.id ?? "").padStart(2, "0");
    }
  }
  return null;
}

async function fetchEarthquakePage(params: URLSearchParams, logPrefix: string) {
  return fetchJsonWithRetry<UsgsGeoJsonPayload>(
    `${USGS_EVENT_QUERY_URL}?${params.toString()}`,
    {},
    { logPrefix, rateLimitDelayMs: 120 },
  );
}

function getEventKey(feature: UsgsFeature) {
  if (feature.id) return feature.id;
  const coordinates = feature.geometry?.coordinates?.join(",");
  return `${feature.properties?.time ?? "unknown"}:${feature.properties?.mag ?? "unknown"}:${coordinates ?? "unknown"}`;
}

export async function fetchUsgsEarthquakeCounts(
  options: FetchUsgsEarthquakeOptions,
): Promise<WeatherProviderResult> {
  const startYear = options.startYear ?? DEFAULT_YEAR_RANGE.start;
  const endYear = options.endYear ?? DEFAULT_YEAR_RANGE.end;
  const observations: WeatherProviderResult["observations"] = [];
  const warnings: string[] = [];
  const failedYears: number[] = [];
  const skippedYears: number[] = [];
  const stateFeatures = getUSStateFeatures().filter((feature) => weatherStateIdSet.has(feature.properties.stateId));
  const countsByYearState = new Map<string, number>();
  let skippedRows = 0;
  let eventsMatchedToStates = 0;
  let eventsOutsideStates = 0;
  let duplicateEventsSkipped = 0;

  for (let year = startYear; year <= endYear; year += 1) {
    console.log(`${options.logPrefix} Fetching USGS earthquakes year=${year}...`);
    try {
      const { starttime, endtime } = yearRange(year);
      const seenEventKeys = new Set<string>();

      for (const region of USGS_QUERY_REGIONS) {
        let offset = 1;
        let fetchedAll = false;

        while (!fetchedAll) {
          const params = new URLSearchParams({
            format: "geojson",
            starttime,
            endtime,
            minmagnitude: String(MIN_MAGNITUDE),
            eventtype: "earthquake",
            orderby: "time-asc",
            minlatitude: String(region.minlatitude),
            maxlatitude: String(region.maxlatitude),
            minlongitude: String(region.minlongitude),
            maxlongitude: String(region.maxlongitude),
            limit: String(PAGE_LIMIT),
            offset: String(offset),
          });

          const payload = await fetchEarthquakePage(params, options.logPrefix);
          const features = payload.features ?? [];

          for (const feature of features) {
            const coordinates = feature.geometry?.coordinates;
            const magnitude = feature.properties?.mag;
            if (!coordinates || typeof magnitude !== "number" || magnitude < MIN_MAGNITUDE) {
              skippedRows += 1;
              continue;
            }

            const eventKey = getEventKey(feature);
            if (seenEventKeys.has(eventKey)) {
              duplicateEventsSkipped += 1;
              continue;
            }
            seenEventKeys.add(eventKey);

            const [longitude, latitude] = coordinates;
            if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) {
              skippedRows += 1;
              continue;
            }

            const stateId = stateIdForPoint(stateFeatures, longitude, latitude);
            if (!stateId || !weatherStateIdSet.has(stateId)) {
              eventsOutsideStates += 1;
              continue;
            }

            const key = `${year}:${stateId}`;
            countsByYearState.set(key, (countsByYearState.get(key) ?? 0) + 1);
            eventsMatchedToStates += 1;
          }

          if (features.length < PAGE_LIMIT) {
            fetchedAll = true;
          } else {
            offset += PAGE_LIMIT;
          }
        }
      }

      for (const state of weatherStates) {
        observations.push({
          metricId: options.metricId,
          stateId: state.id,
          year,
          value: countsByYearState.get(`${year}:${state.id}`) ?? 0,
        });
      }
    } catch (error) {
      failedYears.push(year);
      warnings.push(`${options.logPrefix} Failed USGS earthquake year ${year}: ${error instanceof Error ? error.message : String(error)}`);
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
      provider: "USGS Earthquake Catalog API",
      minimumMagnitude: MIN_MAGNITUDE,
      aggregation: "Yearly bounded API queries, point-in-polygon state assignment, yearly counts by state",
      queryRegions: USGS_QUERY_REGIONS.map((region) => region.label),
      startYear,
      endYear,
      eventsMatchedToStates,
      eventsOutsideStates,
      duplicateEventsSkipped,
      failedYears,
      skippedYears,
    },
  };
}
