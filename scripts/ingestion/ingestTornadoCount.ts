import type { IngestionSummary } from "../../lib/types";
import { DEFAULT_YEAR_RANGE } from "./config";
import { fetchNoaaTornadoCounts } from "./providers/noaaStormEvents";
import { runWeatherMetricIngestion } from "./runWeatherMetricIngestion";
import { DATA_SOURCE_CONFIGS } from "./utils";

const METRIC_ID = "tornado_count";
const LOG_PREFIX = "[ingestTornadoCount]";

export async function runTornadoCountIngestion(): Promise<IngestionSummary> {
  return runWeatherMetricIngestion({
    metricId: METRIC_ID,
    logPrefix: LOG_PREFIX,
    source: DATA_SOURCE_CONFIGS.noaaStormEvents,
    fetchObservations: () =>
      fetchNoaaTornadoCounts({
        metricId: METRIC_ID,
        startYear: DEFAULT_YEAR_RANGE.start,
        endYear: DEFAULT_YEAR_RANGE.end,
        logPrefix: LOG_PREFIX,
      }),
  });
}
