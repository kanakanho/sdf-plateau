/** Converts parsed CityGML building geometry into local-frame triangles. */
import { SurfaceType, type SurfaceTypeCode } from '../../src/data/meshFormat';
import { type LocalFrame, lngLatToLocal } from '../../src/geo/localFrame';
import { triangulatePolygon } from '../../src/geom/polygon';
import { triangleArea } from '../../src/geom/triangle';
import type { V3 } from '../../src/geom/vec3';
import { extractLod1Polygons, extractLod2Surfaces, type GmlPolygon, type LatLonH, type SurfaceKind } from './gml';

export type BuildingGeometry = {
  readonly lod: 1 | 2;
  readonly groundElevation: number;
  /** 9 floats per triangle */
  readonly positions: number[];
  readonly surfaceTypes: SurfaceTypeCode[];
};

const KIND_TO_TYPE: Record<SurfaceKind, SurfaceTypeCode> = {
  wall: SurfaceType.Wall,
  roof: SurfaceType.Roof,
  ground: SurfaceType.Ground,
  installation: SurfaceType.Installation,
  other: SurfaceType.Other,
};

export const surfaceKindToType = (kind: SurfaceKind): SurfaceTypeCode => KIND_TO_TYPE[kind];

/** LOD1 solids carry no semantics: classify faces by their normal. */
export const classifyByNormal = (nz: number): SurfaceTypeCode =>
  nz > 0.5 ? SurfaceType.Roof : nz < -0.5 ? SurfaceType.Ground : SurfaceType.Wall;

export const toLocal = (frame: LocalFrame, p: LatLonH, groundElevation: number): V3 => {
  const [x, y] = lngLatToLocal(frame, p[1], p[0]);
  return [x, y, p[2] - groundElevation];
};

const allHeights = (polys: readonly GmlPolygon[]): number[] =>
  polys.flatMap((p) => p.exterior.map((v) => v[2]));

/** Ground elevation = lowest ground-surface vertex, or lowest vertex overall. */
export const groundElevationOf = (groundPolys: readonly GmlPolygon[], allPolys: readonly GmlPolygon[]): number => {
  const hs = allHeights(groundPolys.length ? groundPolys : allPolys);
  return hs.length ? Math.min(...hs) : 0;
};

export const triangulateToLocal = (
  frame: LocalFrame,
  poly: GmlPolygon,
  groundElevation: number,
  minArea = 1e-4,
): V3[][] =>
  triangulatePolygon(
    poly.exterior.map((p) => toLocal(frame, p, groundElevation)),
    poly.interiors.map((r) => r.map((p) => toLocal(frame, p, groundElevation))),
  ).filter(([a, b, c]) => triangleArea(a, b, c) >= minArea);

const faceNormalZ = ([a, b, c]: V3[]): number => {
  const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
  const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
  const nx = uy * vz - uz * vy;
  const ny = uz * vx - ux * vz;
  const nz = ux * vy - uy * vx;
  const l = Math.hypot(nx, ny, nz);
  return l > 0 ? nz / l : 0;
};

export const buildingGeometry = (xml: string, frame: LocalFrame): BuildingGeometry | null => {
  const lod2 = extractLod2Surfaces(xml);
  const positions: number[] = [];
  const surfaceTypes: SurfaceTypeCode[] = [];
  if (lod2.length) {
    const ground = lod2.filter((s) => s.kind === 'ground').flatMap((s) => s.polygons);
    const g = groundElevationOf(ground, lod2.flatMap((s) => s.polygons));
    for (const s of lod2) {
      const type = surfaceKindToType(s.kind);
      for (const poly of s.polygons) {
        for (const tri of triangulateToLocal(frame, poly, g)) {
          positions.push(...tri[0], ...tri[1], ...tri[2]);
          surfaceTypes.push(type);
        }
      }
    }
    return surfaceTypes.length ? { lod: 2, groundElevation: g, positions, surfaceTypes } : null;
  }
  const lod1 = extractLod1Polygons(xml);
  if (!lod1.length) return null;
  const g = groundElevationOf([], lod1);
  for (const poly of lod1) {
    for (const tri of triangulateToLocal(frame, poly, g)) {
      positions.push(...tri[0], ...tri[1], ...tri[2]);
      surfaceTypes.push(classifyByNormal(faceNormalZ(tri)));
    }
  }
  return surfaceTypes.length ? { lod: 1, groundElevation: g, positions, surfaceTypes } : null;
};
