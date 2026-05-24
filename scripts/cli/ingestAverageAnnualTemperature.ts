import { runAverageAnnualTemperatureIngestion } from "../ingestion/ingestAverageAnnualTemperature";

runAverageAnnualTemperatureIngestion().catch((error) => {
  console.error("[ingestAverageAnnualTemperature CLI] Failed:", error);
  process.exitCode = 1;
});
