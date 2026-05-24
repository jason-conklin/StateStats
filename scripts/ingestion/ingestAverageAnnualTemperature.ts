import type { IngestionSummary } from "../../lib/types";
import { DEFAULT_YEAR_RANGE } from "./config";
import { fetchClimateAtAGlanceStateSeries } from "./providers/noaaClimateAtAGlance";
import { runWeatherMetricIngestion } from "./runWeatherMetricIngestion";
import { DATA_SOURCE_CONFIGS, loadIngestionEnv } from "./utils";

const METRIC_ID = "average_annual_temperature";
const LOG_PREFIX = "[ingestAverageAnnualTemperature]";

export async function runAverageAnnualTemperatureIngestion(): Promise<IngestionSummary> {
  loadIngestionEnv();
  const noaaToken = process.env.NOAA_CDO_TOKEN?.trim() ?? "";

  return runWeatherMetricIngestion({
    metricId: METRIC_ID,
    logPrefix: LOG_PREFIX,
    source: DATA_SOURCE_CONFIGS.noaaClimateAtAGlance,
    fetchObservations: () =>
      fetchClimateAtAGlanceStateSeries({
        metricId: METRIC_ID,
        parameter: "tavg",
        startYear: DEFAULT_YEAR_RANGE.start,
        endYear: DEFAULT_YEAR_RANGE.end,
        noaaToken,
        logPrefix: LOG_PREFIX,
      }),
  });
}
