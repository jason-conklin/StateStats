import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { states as stateList } from "@/lib/states";

const graphStateList = stateList.filter((state) => state.id !== "11");

function normalizeStateId(value: string | null) {
  const code = value?.trim().toUpperCase();
  if (!code) return null;

  const match =
    graphStateList.find((state) => state.abbreviation.toUpperCase() === code) ??
    graphStateList.find((state) => state.id === code);

  return match?.id ?? null;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get("mode");

  if (mode === "metrics") {
    const stateId = normalizeStateId(searchParams.get("state"));
    const metricIds = Array.from(
      new Set(
        (searchParams.get("metrics") ?? "")
          .split(",")
          .map((metricId) => metricId.trim())
          .filter(Boolean),
      ),
    );

    if (!stateId) {
      return NextResponse.json({ error: "valid state is required" }, { status: 400 });
    }

    if (!metricIds.length) {
      return NextResponse.json({ error: "metrics is required" }, { status: 400 });
    }

    const metrics = await prisma.metric.findMany({
      where: { id: { in: metricIds } },
      orderBy: { name: "asc" },
    });
    const metricOrder = new Map(metricIds.map((metricId, index) => [metricId, index]));
    const orderedMetrics = metrics.sort(
      (left, right) => (metricOrder.get(left.id) ?? 0) - (metricOrder.get(right.id) ?? 0),
    );

    if (!orderedMetrics.length) {
      return NextResponse.json({ error: "metrics not found" }, { status: 404 });
    }

    const observations = await prisma.observation.findMany({
      where: {
        stateId,
        metricId: { in: orderedMetrics.map((metric) => metric.id) },
      },
      select: { metricId: true, year: true, value: true },
      orderBy: [{ year: "asc" }],
    });

    const years = Array.from(new Set(observations.map((observation) => observation.year))).sort((a, b) => a - b);
    const observationsByMetricId = new Map<string, { year: number; value: number | null }[]>();
    observations.forEach((observation) => {
      const points = observationsByMetricId.get(observation.metricId) ?? [];
      points.push({ year: observation.year, value: observation.value });
      observationsByMetricId.set(observation.metricId, points);
    });

    return NextResponse.json({
      availableYears: years,
      series: orderedMetrics.map((metric) => ({
        metricId: metric.id,
        metricName: metric.name,
        unit: metric.unit,
        points: observationsByMetricId.get(metric.id) ?? [],
      })),
    });
  }

  const metricId = searchParams.get("metric");

  if (!metricId) {
    return NextResponse.json({ error: "metric is required" }, { status: 400 });
  }

  const metric = await prisma.metric.findUnique({
    where: { id: metricId },
    include: { source: true },
  });

  if (!metric) {
    return NextResponse.json({ error: "metric not found" }, { status: 404 });
  }

  const observations = await prisma.observation.findMany({
    where: { metricId },
    select: { stateId: true, year: true, value: true },
    orderBy: [{ year: "asc" }],
  });

  const years = Array.from(new Set(observations.map((o) => o.year))).sort((a, b) => a - b);

  const seriesMap = new Map<
    string,
    {
      stateId: string;
      stateName: string;
      points: { year: number; value: number | null }[];
    }
  >();

  observations.forEach((obs) => {
    if (!seriesMap.has(obs.stateId)) {
      const match = stateList.find((state) => state.id === obs.stateId);
      seriesMap.set(obs.stateId, {
        stateId: obs.stateId,
        stateName: match?.name ?? obs.stateId,
        points: [],
      });
    }
    const entry = seriesMap.get(obs.stateId);
    if (entry) {
      entry.points.push({ year: obs.year, value: obs.value });
    }
  });

  const response = {
    metric: {
      id: metric.id,
      name: metric.name,
      unit: metric.unit,
      description: metric.description,
      sourceName: metric.source?.name ?? null,
    },
    availableYears: years,
    series: Array.from(seriesMap.values()),
  };

  return NextResponse.json(response);
}
