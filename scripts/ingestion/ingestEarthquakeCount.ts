import type { IngestionSummary } from "../../lib/types";
import { DEFAULT_YEAR_RANGE } from "./config";
import { fetchUsgsEarthquakeCounts } from "./providers/usgsEarthquakes";
import { runWeatherMetricIngestion } from "./runWeatherMetricIngestion";
import { DATA_SOURCE_CONFIGS } from "./utils";

const METRIC_ID = "earthquake_count";
const LOG_PREFIX = "[ingestEarthquakeCount]";

export async function runEarthquakeCountIngestion(): Promise<IngestionSummary> {
  return runWeatherMetricIngestion({
    metricId: METRIC_ID,
    logPrefix: LOG_PREFIX,
    source: DATA_SOURCE_CONFIGS.usgsEarthquakeCatalog,
    fetchObservations: () =>
      fetchUsgsEarthquakeCounts({
        metricId: METRIC_ID,
        startYear: DEFAULT_YEAR_RANGE.start,
        endYear: DEFAULT_YEAR_RANGE.end,
        logPrefix: LOG_PREFIX,
      }),
  });
}
