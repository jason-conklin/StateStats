import { runWeatherMetricIngestions } from "../ingestion/runWeatherMetrics";
import { loadIngestionEnv } from "../ingestion/utils";

function describeSecret(secret: string | undefined) {
  const trimmed = secret?.trim();
  if (!trimmed) return "missing";
  return `present (${trimmed.slice(0, 4)}...)`;
}

async function main() {
  loadIngestionEnv();
  console.log("🚀 [ingestWeather] Starting Phase 1 weather ingestion...");
  console.log(`  NOAA_CDO_TOKEN: ${describeSecret(process.env.NOAA_CDO_TOKEN)}`);

  const startedAt = Date.now();
  const summaries = await runWeatherMetricIngestions();
  const failed = summaries.filter((summary) => summary.status === "failed");
  if (failed.length > 0) {
    throw new Error(`One or more weather ingestions failed: ${failed.map((summary) => summary.runId).join(", ")}`);
  }

  const durationSeconds = ((Date.now() - startedAt) / 1000).toFixed(1);
  console.log(`✅ [ingestWeather] Finished in ${durationSeconds}s.`);
}

main().catch((error) => {
  console.error("❌ [ingestWeather] Failed:", error);
  process.exitCode = 1;
});
