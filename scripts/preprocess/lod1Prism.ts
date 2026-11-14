/**
 * LOD1 solids are extruded footprints, so they are stored as "footprint rings + height" instead of
 * triangles. Pure functions over parsed GML polygons (lat, lon, h in EPSG:6697).
 */
import { RING_HOLE } from '../../src/data/tileFormat';
import type { GmlPolygon, LatLonH } from './gml';

export type Lod1Prism = {
  /** T.P. meters of the footprint (z = 0 in the local frame) */
  readonly groundElevation: number;
  /** roof height above the footprint [m] */
  readonly height: number;
  /** footprint vertices as (lng, lat) pairs, rings open (no repeated closing vertex) */
  readonly coords: Float64Array;
  /** vertex count per ring, `| RING_HOLE` for interiors; exteriors CCW, holes CW seen from above */
  readonly rings: Uint32Array;
};

export type Lod1SkipReason = 'noPolygons' | 'noHorizontalFace' | 'flat' | 'degenerate';
export type Lod1PrismResult = { readonly prism: Lod1Prism } | { readonly skip: Lod1SkipReason };

const ringZRange = (ring: readonly LatLonH[]): [number, number] => {
  let lo = Infinity;
  let hi = -Infinity;
  for (const p of ring) {
    if (p[2] < lo) lo = p[2];
    if (p[2] > hi) hi = p[2];
  }
  return [lo, hi];
};

/** z range over the exterior and interior rings of a polygon. */
export const polygonZRange = (poly: GmlPolygon): [number, number] =>
  [poly.exterior, ...poly.interiors].map(ringZRange).reduce(([a, b], [c, d]) => [Math.min(a, c), Math.max(b, d)]);

export const isHorizontal = (poly: GmlPolygon, tolerance: number): boolean => {
  const [lo, hi] = polygonZRange(poly);
  return hi - lo <= tolerance;
};

/** Drops the closing vertex and consecutive duplicates; returns (lng, lat) pairs. */
export const openRing2d = (ring: readonly LatLonH[]): number[] => {
  const out: number[] = [];
  for (const [lat, lng] of ring) {
    const n = out.length;
    if (n && out[n - 2] === lng && out[n - 1] === lat) continue;
    out.push(lng, lat);
  }
  while (out.length >= 4 && out[0] === out[out.length - 2] && out[1] === out[out.length - 1]) out.length -= 2;
  return out;
};

/** Shoelace signed area of (x, y) pairs; positive = counter-clockwise. */
export const signedArea2d = (xy: ArrayLike<number>): number => {
  let s = 0;
  const n = xy.length / 2;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    s += xy[i * 2] * xy[j * 2 + 1] - xy[j * 2] * xy[i * 2 + 1];
  }
  return s / 2;
};

/** Reverses the vertex order of (x, y) pairs when the ring's orientation is not the wanted one. */
export const orientRing = (xy: number[], ccw: boolean): number[] => {
  if (signedArea2d(xy) > 0 === ccw) return xy;
  const out: number[] = [];
  for (let i = xy.length - 2; i >= 0; i -= 2) out.push(xy[i], xy[i + 1]);
  return out;
};

/**
 * Footprint = the lowest horizontal face(s), height = max z − footprint z.
 * LOD2 geometry is ignored on purpose: the area pages draw LOD1 everywhere.
 */
export const lod1Prism = (polygons: readonly GmlPolygon[], tolerance = 0.05): Lod1PrismResult => {
  if (!polygons.length) return { skip: 'noPolygons' };
  const horizontal = polygons.filter((p) => isHorizontal(p, tolerance));
  if (!horizontal.length) return { skip: 'noHorizontalFace' };
  const ground = Math.min(...horizontal.map((p) => polygonZRange(p)[0]));
  const top = Math.max(...polygons.map((p) => polygonZRange(p)[1]));
  if (top - ground <= tolerance) return { skip: 'flat' };

  const coords: number[] = [];
  const rings: number[] = [];
  for (const poly of horizontal) {
    if (polygonZRange(poly)[0] - ground > tolerance) continue;
    const ext = openRing2d(poly.exterior);
    if (ext.length < 6 || signedArea2d(ext) === 0) continue;
    coords.push(...orientRing(ext, true));
    rings.push(ext.length / 2);
    for (const hole of poly.interiors) {
      const h = openRing2d(hole);
      if (h.length < 6 || signedArea2d(h) === 0) continue;
      coords.push(...orientRing(h, false));
      rings.push((h.length / 2) | RING_HOLE);
    }
  }
  if (!rings.length) return { skip: 'degenerate' };
  return {
    prism: {
      groundElevation: ground,
      height: top - ground,
      coords: new Float64Array(coords),
      rings: new Uint32Array(rings.map((r) => r >>> 0)),
    },
  };
};
