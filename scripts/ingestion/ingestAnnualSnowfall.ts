import type { IngestionSummary } from "../../lib/types";
import { DEFAULT_YEAR_RANGE } from "./config";
import { fetchNoaaCdoAnnualSnowfall } from "./providers/noaaCdoSnowfall";
import { runWeatherMetricIngestion } from "./runWeatherMetricIngestion";
import { DATA_SOURCE_CONFIGS, loadIngestionEnv } from "./utils";

const METRIC_ID = "annual_snowfall";
const LOG_PREFIX = "[ingestAnnualSnowfall]";

export async function runAnnualSnowfallIngestion(): Promise<IngestionSummary> {
  loadIngestionEnv();
  const noaaToken = process.env.NOAA_CDO_TOKEN?.trim() ?? "";

  return runWeatherMetricIngestion({
    metricId: METRIC_ID,
    logPrefix: LOG_PREFIX,
    source: DATA_SOURCE_CONFIGS.noaaCdo,
    fetchObservations: () =>
      fetchNoaaCdoAnnualSnowfall({
        metricId: METRIC_ID,
        startYear: DEFAULT_YEAR_RANGE.start,
        endYear: DEFAULT_YEAR_RANGE.end,
        noaaToken,
        logPrefix: LOG_PREFIX,
      }),
  });
}
