import { runAnnualSnowfallIngestion } from "../ingestion/ingestAnnualSnowfall";

runAnnualSnowfallIngestion().catch((error) => {
  console.error("[ingestAnnualSnowfall CLI] Failed:", error);
  process.exitCode = 1;
});
