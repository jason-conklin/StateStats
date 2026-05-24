import { runAnnualPrecipitationIngestion } from "../ingestion/ingestAnnualPrecipitation";

runAnnualPrecipitationIngestion().catch((error) => {
  console.error("[ingestAnnualPrecipitation CLI] Failed:", error);
  process.exitCode = 1;
});
