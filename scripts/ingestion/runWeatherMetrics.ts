import type { IngestionSummary } from "../../lib/types";
import { runAnnualPrecipitationIngestion } from "./ingestAnnualPrecipitation";
import { runAnnualSnowfallIngestion } from "./ingestAnnualSnowfall";
import { runAverageAnnualTemperatureIngestion } from "./ingestAverageAnnualTemperature";
import { runEarthquakeCountIngestion } from "./ingestEarthquakeCount";
import { runTornadoCountIngestion } from "./ingestTornadoCount";

type MetricRunner = () => Promise<IngestionSummary>;

const WEATHER_INGESTION_STEPS: Array<{ metricId: string; run: MetricRunner }> = [
  { metricId: "average_annual_temperature", run: runAverageAnnualTemperatureIngestion },
  { metricId: "annual_precipitation", run: runAnnualPrecipitationIngestion },
  { metricId: "annual_snowfall", run: runAnnualSnowfallIngestion },
  { metricId: "tornado_count", run: runTornadoCountIngestion },
  { metricId: "earthquake_count", run: runEarthquakeCountIngestion },
];

export async function runWeatherMetricIngestions(): Promise<IngestionSummary[]> {
  console.log("[ingestWeatherMetrics] Starting weather ingestions...");
  const summaries: IngestionSummary[] = [];

  for (const step of WEATHER_INGESTION_STEPS) {
    console.log(`[ingestWeatherMetrics] ▶ Running ${step.metricId}...`);
    try {
      const summary = await step.run();
      if (summary.status === "failed") {
        throw new Error(`Metric ${step.metricId} returned failed status.`);
      }
      summaries.push(summary);
      console.log(`[ingestWeatherMetrics] ✅ ${step.metricId} done (status=${summary.status}).`);
    } catch (error) {
      console.error(`[ingestWeatherMetrics] ❌ ${step.metricId} failed.`, error);
      throw error;
    }
  }

  console.log("[ingestWeatherMetrics] Completed weather ingestions.");
  return summaries;
}
