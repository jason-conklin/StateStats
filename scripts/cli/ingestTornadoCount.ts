import { runTornadoCountIngestion } from "../ingestion/ingestTornadoCount";

runTornadoCountIngestion().catch((error) => {
  console.error("[ingestTornadoCount CLI] Failed:", error);
  process.exitCode = 1;
});
