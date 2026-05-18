'use client';

import { geoAlbersUsa, geoPath, GeoPermissibleObjects } from "d3-geo";
import { Feature, FeatureCollection, Geometry } from "geojson";
import type { MouseEvent, PointerEventHandler, WheelEventHandler } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { NEUTRAL_COLOR } from "@/lib/mapScales";
import type { MapTransform } from "./useMapZoom";

type Props = {
  features: Feature<Geometry, { stateId?: string; name?: string; abbreviation?: string }>[];
  valuesByStateId: Record<string, number | null>;
  colorScale: (value: number | null) => string;
  onHover: (stateId: string | null, position?: { x: number; y: number }) => void;
  onClick: (stateId: string) => void;
  selectedYear: number;
  hoveredStateId?: string | null;
  pinnedStateId?: string | null;
  transform?: MapTransform;
  isPanning?: boolean;
  onWheel?: WheelEventHandler<SVGSVGElement>;
  onPointerDown?: PointerEventHandler<SVGSVGElement>;
  onPointerMove?: PointerEventHandler<SVGSVGElement>;
  onPointerUp?: PointerEventHandler<SVGSVGElement>;
  onPointerCancel?: PointerEventHandler<SVGSVGElement>;
  consumeClickSuppressed?: () => boolean;
};

export function USChoropleth({
  features,
  valuesByStateId,
  colorScale,
  onHover,
  onClick,
  selectedYear,
  hoveredStateId,
  pinnedStateId,
  transform,
  isPanning = false,
  onWheel,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
  consumeClickSuppressed,
}: Props) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [viewport, setViewport] = useState({ width: 960, height: 560 });

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;

    const updateSize = () => {
      const rect = svg.getBoundingClientRect();
      const width = Math.max(1, Math.round(rect.width));
      const height = Math.max(1, Math.round(rect.height));
      setViewport((prev) => (prev.width === width && prev.height === height ? prev : { width, height }));
    };

    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(svg);
    return () => observer.disconnect();
  }, []);

  const { path, projection } = useMemo(() => {
    const projection = geoAlbersUsa();
    const { width, height } = viewport;
    const isMobileViewport = width < 640;
    const isDesktopViewport = width >= 768;
    const padding = Math.max(12, Math.min(24, Math.round(Math.min(width, height) * 0.03)));
    const topInset = isDesktopViewport
      ? padding + Math.max(52, Math.min(88, Math.round(height * 0.09)))
      : padding;
    const fallbackProjection = () =>
      projection.scale(Math.min(width, height) * 2.15).translate([Math.round(width / 2), Math.round(height / 2)]);

    let collection: FeatureCollection<Geometry> | null = null;

    if (!features.length) {
      fallbackProjection();
    } else {
      try {
        collection = { type: "FeatureCollection", features } as FeatureCollection<Geometry>;
        projection.fitExtent(
          [
            [padding, topInset],
            [Math.max(padding + 1, width - padding), Math.max(padding + 1, height - padding)],
          ],
          collection as unknown as GeoPermissibleObjects,
        );
      } catch {
        fallbackProjection();
      }
    }

    let path = geoPath(projection);

    if (collection && isMobileViewport) {
      const [[, minY]] = path.bounds(collection as unknown as GeoPermissibleObjects);
      const desiredTop = Math.max(6, Math.round(padding * 0.5));
      const deltaY = minY - desiredTop;

      if (Number.isFinite(deltaY) && deltaY > 0) {
        const [translateX, translateY] = projection.translate();
        projection.translate([translateX, translateY - deltaY]);
        path = geoPath(projection);
      }
    }

    return { path, projection };
  }, [features, viewport]);

  // If the projection failed to initialize, don't render.
  if (!projection) {
    return null;
  }

  const mapTransform = transform ?? { scale: 1, x: 0, y: 0 };

  const handleMouseEnter = (stateId: string | null) => (event: MouseEvent<SVGPathElement>) => {
    if (isPanning) {
      onHover(null);
      return;
    }
    const rect = (event.currentTarget.ownerSVGElement as SVGSVGElement)?.getBoundingClientRect();
    const position = rect
      ? {
          x: event.clientX - rect.left,
          y: event.clientY - rect.top,
        }
      : undefined;
    onHover(stateId, position);
  };

  const preserveAspectRatio = viewport.width < 640 ? "xMidYMin meet" : "xMidYMid meet";
  const isMobileViewport = viewport.width < 640;
  const sideOceanLabelSize = isMobileViewport ? 10 : 18;
  const gulfLabelSize = isMobileViewport ? 9 : 14;
  const getProjectedPoint = (longitude: number, latitude: number, fallbackX: number, fallbackY: number) => {
    const projected = projection([longitude, latitude]);
    return projected ?? [fallbackX, fallbackY];
  };
  const [pacificLabelX, pacificLabelY] = getProjectedPoint(-127.2, 35.6, viewport.width * 0.08, viewport.height * 0.39);
  const [atlanticLabelX, atlanticLabelY] = getProjectedPoint(
    isMobileViewport ? -70.6 : -67.8,
    36.2,
    viewport.width * (isMobileViewport ? 0.89 : 0.93),
    viewport.height * 0.4,
  );
  const [projectedGulfLabelX, projectedGulfLabelY] = getProjectedPoint(
    -90,
    29.5,
    viewport.width * (isMobileViewport ? 0.66 : 0.62),
    viewport.height * (isMobileViewport ? 0.4 : 0.78),
  );
  const gulfLabelX = isMobileViewport
    ? projectedGulfLabelX + viewport.width * 0.02
    : projectedGulfLabelX - viewport.width * 0.035;
  const gulfLabelY = isMobileViewport
    ? projectedGulfLabelY + Math.min(30, Math.max(20, viewport.width * 0.065))
    : projectedGulfLabelY + Math.min(72, Math.max(48, viewport.height * 0.08));

  return (
    <div className="relative h-full w-full">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${viewport.width} ${viewport.height}`}
        role="img"
        aria-label={`Choropleth map of U.S. states for year ${selectedYear}`}
        className="h-full w-full"
        preserveAspectRatio={preserveAspectRatio}
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
      >
        <rect width="100%" height="100%" fill="transparent" />
        <g
          transform={`translate(${mapTransform.x} ${mapTransform.y}) scale(${mapTransform.scale})`}
          className="[will-change:transform]"
        >
          {features.map((feat) => {
            const stateId = (feat.id as string) ?? feat.properties?.stateId ?? "";
            const value = valuesByStateId[stateId] ?? null;
            const fill = colorScale(value);
            const d = path(feat) ?? undefined;
            const isPinned = stateId === pinnedStateId;
            const isHovered = stateId === hoveredStateId;
            const isHighlighted = isHovered || isPinned;

            return (
              <path
                key={stateId}
                d={d}
                fill={fill}
                stroke={isHighlighted ? "#ffffff" : "#e1e7ea"}
                strokeWidth={isPinned ? 2.6 : isHovered ? 1.9 : 0.7}
                vectorEffect="non-scaling-stroke"
                strokeLinejoin="round"
                strokeLinecap="round"
                onMouseEnter={handleMouseEnter(stateId)}
                onMouseMove={handleMouseEnter(stateId)}
                onMouseLeave={handleMouseEnter(null)}
                onClick={() => {
                  if (consumeClickSuppressed?.()) {
                    return;
                  }
                  onClick(stateId);
                }}
                className={`outline-none focus:outline-none focus-visible:outline-none transition-[fill] duration-200 ease-out ${
                  mapTransform.scale > 1.01 ? (isPanning ? "cursor-grabbing" : "cursor-grab") : "cursor-pointer"
                }`}
                tabIndex={0}
                role="button"
                aria-label={`${feat.properties?.name ?? stateId}: ${value ?? "No data"}`}
              />
            );
          })}
          <path
            d={path({ type: "Sphere" } as GeoPermissibleObjects) ?? undefined}
            fill="none"
            stroke={NEUTRAL_COLOR}
            strokeWidth={0.5}
            vectorEffect="non-scaling-stroke"
          />
          <g pointerEvents="none" aria-hidden="true">
            <text
              x={pacificLabelX}
              y={pacificLabelY}
              transform={`rotate(-90 ${pacificLabelX} ${pacificLabelY})`}
              textAnchor="middle"
              style={{ fontSize: sideOceanLabelSize }}
              className="select-none fill-sky-950/20 font-serif italic tracking-[0.1em] drop-shadow-[0_1px_1px_rgba(255,255,255,0.2)] sm:fill-sky-950/30 sm:tracking-[0.18em]"
            >
              Pacific Ocean
            </text>
            <text
              x={atlanticLabelX}
              y={atlanticLabelY}
              transform={`rotate(90 ${atlanticLabelX} ${atlanticLabelY})`}
              textAnchor="middle"
              style={{ fontSize: sideOceanLabelSize }}
              className="select-none fill-sky-950/20 font-serif italic tracking-[0.1em] drop-shadow-[0_1px_1px_rgba(255,255,255,0.2)] sm:fill-sky-950/30 sm:tracking-[0.18em]"
            >
              Atlantic Ocean
            </text>
            <text
              x={gulfLabelX}
              y={gulfLabelY}
              transform={`rotate(-10 ${gulfLabelX} ${gulfLabelY})`}
              textAnchor="middle"
              style={{ fontSize: gulfLabelSize }}
              className="select-none fill-sky-950/25 font-serif italic tracking-[0.08em] drop-shadow-[0_1px_1px_rgba(255,255,255,0.2)] sm:fill-sky-950/30 sm:tracking-[0.14em]"
            >
              Gulf of Mexico
            </text>
          </g>
        </g>
      </svg>
    </div>
  );
}
