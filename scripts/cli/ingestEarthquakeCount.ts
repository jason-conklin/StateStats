import { runEarthquakeCountIngestion } from "../ingestion/ingestEarthquakeCount";

runEarthquakeCountIngestion().catch((error) => {
  console.error("[ingestEarthquakeCount CLI] Failed:", error);
  process.exitCode = 1;
});
