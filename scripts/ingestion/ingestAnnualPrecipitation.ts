import type { IngestionSummary } from "../../lib/types";
import { DEFAULT_YEAR_RANGE } from "./config";
import { fetchClimateAtAGlanceStateSeries } from "./providers/noaaClimateAtAGlance";
import { runWeatherMetricIngestion } from "./runWeatherMetricIngestion";
import { DATA_SOURCE_CONFIGS, loadIngestionEnv } from "./utils";

const METRIC_ID = "annual_precipitation";
const LOG_PREFIX = "[ingestAnnualPrecipitation]";

export async function runAnnualPrecipitationIngestion(): Promise<IngestionSummary> {
  loadIngestionEnv();
  const noaaToken = process.env.NOAA_CDO_TOKEN?.trim() ?? "";

  return runWeatherMetricIngestion({
    metricId: METRIC_ID,
    logPrefix: LOG_PREFIX,
    source: DATA_SOURCE_CONFIGS.noaaClimateAtAGlance,
    fetchObservations: () =>
      fetchClimateAtAGlanceStateSeries({
        metricId: METRIC_ID,
        parameter: "pcp",
        startYear: DEFAULT_YEAR_RANGE.start,
        endYear: DEFAULT_YEAR_RANGE.end,
        noaaToken,
        logPrefix: LOG_PREFIX,
      }),
  });
}
