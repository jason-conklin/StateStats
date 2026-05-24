import { IngestionStatus, Prisma, PrismaClient } from "@prisma/client";
import type { IngestionSummary } from "../../lib/types";
import {
  buildCoverageWarnings,
  completeIngestionRun,
  ensureDataSource,
  ensureMetric,
  ensureStates,
  getMetricYearBounds,
  loadIngestionEnv,
  normalizeLegacyDataSources,
  startIngestionRun,
  upsertObservationsWithCounts,
} from "./utils";
import { weatherStateIds, weatherStateIdSet, WEATHER_EXPECTED_STATE_COUNT } from "./weatherStates";
import { getYearBounds, uniqueSortedYears, type WeatherProviderResult } from "./weatherTypes";

type DataSourceConfig = {
  id: string;
  name: string;
  description?: string | null;
  homepageUrl?: string | null;
  apiDocsUrl?: string | null;
};

type RunWeatherMetricIngestionOptions = {
  metricId: string;
  logPrefix: string;
  source: DataSourceConfig;
  fetchObservations: () => Promise<WeatherProviderResult>;
};

export async function runWeatherMetricIngestion(
  options: RunWeatherMetricIngestionOptions,
): Promise<IngestionSummary> {
  loadIngestionEnv();

  const client = new PrismaClient();
  const warnings: string[] = [];
  let runId: string | null = null;
  let runStartedAtIso = new Date().toISOString();

  try {
    console.log(`${options.logPrefix} Starting ingestion...`);
    console.log(`${options.logPrefix} metricId=${options.metricId}`);

    await ensureStates(client);
    await normalizeLegacyDataSources(client);
    await ensureDataSource(client, options.source);
    await ensureMetric(client, options.metricId, { sourceId: options.source.id, isDefault: false });

    const stateIds = weatherStateIds;
    const stateIdSet = weatherStateIdSet;
    console.log(`${options.logPrefix} expectedStates=${WEATHER_EXPECTED_STATE_COUNT} states (District of Columbia excluded)`);

    const providerResult = await options.fetchObservations();
    warnings.push(...providerResult.warnings);

    const validRows = providerResult.observations.filter((row) => {
      return (
        row.metricId === options.metricId &&
        stateIdSet.has(row.stateId) &&
        Number.isInteger(row.year) &&
        Number.isFinite(row.value)
      );
    });

    const invalidRows = providerResult.observations.length - validRows.length;
    if (invalidRows > 0) {
      warnings.push(`${options.logPrefix} Dropped ${invalidRows} malformed provider observation(s).`);
    }

    if (!validRows.length) {
      throw new Error(`${options.logPrefix} No valid observations available to write.`);
    }

    const allowedYears = providerResult.years.length ? providerResult.years : uniqueSortedYears(validRows);
    if (!allowedYears.length) {
      throw new Error(`${options.logPrefix} Could not determine allowed years for cleanup.`);
    }

    const run = await startIngestionRun(client, options.source.id, { isSynthetic: false, note: null });
    runId = run.id;
    runStartedAtIso = run.startedAt.toISOString();

    const upsertSummary = await upsertObservationsWithCounts(client, validRows);

    const excludedStateCleanupResult = await client.observation.deleteMany({
      where: {
        metricId: options.metricId,
        stateId: { notIn: stateIds },
      },
    });
    if (excludedStateCleanupResult.count > 0) {
      console.log(
        `${options.logPrefix} cleanup excluded states deleted=${excludedStateCleanupResult.count} metricId=${options.metricId}`,
      );
    }

    const oldYearCleanupResult = await client.observation.deleteMany({
      where: {
        metricId: options.metricId,
        year: { notIn: allowedYears },
      },
    });
    const cleanupDeletedCount = excludedStateCleanupResult.count + oldYearCleanupResult.count;
    const remainingCount = await client.observation.count({ where: { metricId: options.metricId } });

    warnings.push(...buildCoverageWarnings(providerResult.coverageByYear, options.logPrefix, stateIds.length));
    warnings.push(...buildCoverageWarnings(upsertSummary.coverageByYear, options.logPrefix, stateIds.length));
    for (const warning of warnings) {
      console.warn(warning);
    }

    const uniqueStateCount = new Set(validRows.map((row) => row.stateId)).size;
    const writtenBounds = getYearBounds(validRows);
    const metricBounds = await getMetricYearBounds(client, options.metricId);
    const failedYears = providerResult.failedYears ?? [];
    const skippedYears = providerResult.skippedYears ?? [];
    const status = failedYears.length || skippedYears.length || warnings.length ? IngestionStatus.partial : IngestionStatus.success;
    const providerDetails = (providerResult.details ?? {}) as Prisma.InputJsonObject;

    await completeIngestionRun(client, run.id, status, {
      isSynthetic: false,
      note: null,
      details: {
        metricId: options.metricId,
        sourceId: options.source.id,
        mode: "real_api",
        counts: {
          expectedStates: stateIds.length,
          uniqueStatesWritten: uniqueStateCount,
          observationsTotal: upsertSummary.total,
          observationsInserted: upsertSummary.inserted,
          observationsUpdated: upsertSummary.updated,
          cleanupDeleted: cleanupDeletedCount,
          cleanupDeletedExcludedStates: excludedStateCleanupResult.count,
          cleanupDeletedOldYears: oldYearCleanupResult.count,
          observationsRemaining: remainingCount,
          skippedRows: providerResult.skippedRows ?? 0,
          invalidRows,
        },
        years: {
          plannedStartYear: allowedYears[0],
          plannedEndYear: allowedYears[allowedYears.length - 1],
          minYear: metricBounds.minYear,
          maxYear: metricBounds.maxYear,
        },
        failedYears,
        skippedYears,
        warnings,
        provider: providerDetails,
      },
    });

    console.log(
      `${options.logPrefix} summary sourceId=${options.source.id} years=${writtenBounds.minYear ?? "—"}-${writtenBounds.maxYear ?? "—"} failedYears=${failedYears.length ? failedYears.join(",") : "none"} skippedYears=${skippedYears.length ? skippedYears.join(",") : "none"} observations=${upsertSummary.total} inserted=${upsertSummary.inserted} updated=${upsertSummary.updated} states=${uniqueStateCount}/${stateIds.length}`,
    );
    console.log(`${options.logPrefix} Completed with status=${status}.`);

    return {
      runId: run.id,
      status,
      startedAt: runStartedAtIso,
      completedAt: new Date().toISOString(),
      counts: {
        states: stateIds.length,
        observationsInserted: upsertSummary.inserted,
        observationsUpdated: upsertSummary.updated,
        years: {
          start: metricBounds.minYear ?? allowedYears[0],
          end: metricBounds.maxYear ?? allowedYears[allowedYears.length - 1],
        },
      },
      errors: warnings,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`${options.logPrefix} Failed:`, error);

    if (runId) {
      await completeIngestionRun(client, runId, IngestionStatus.failed, {
        isSynthetic: false,
        note: errorMessage,
        details: {
          metricId: options.metricId,
          sourceId: options.source.id,
          error: errorMessage,
          warnings,
        },
      });
    }

    throw error;
  } finally {
    await client.$disconnect();
  }
}
