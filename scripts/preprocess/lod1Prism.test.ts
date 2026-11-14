import { describe, expect, it } from 'vitest';
import { RING_HOLE } from '../../src/data/tileFormat';
import { COURTYARD_BUILDING, LOD1_ONLY_BUILDING, LOD2_BUILDING, corners } from './fixtures/building';
import { extractLod1Polygons, type GmlPolygon, type LatLonH } from './gml';
import { isHorizontal, lod1Prism, openRing2d, orientRing, polygonZRange, signedArea2d } from './lod1Prism';

const flat = (pts: number[][], h: number): LatLonH[] => pts.map(([lat, lng]) => [lat, lng, h] as const);

describe('polygonZRange / isHorizontal', () => {
  const poly: GmlPolygon = {
    exterior: [[0, 0, 1], [0, 1, 1.02], [1, 1, 1]],
    interiors: [[[0.2, 0.2, 0.99], [0.2, 0.3, 1], [0.3, 0.3, 1]]],
  };
  it('spans exterior and interior rings', () => {
    const [lo, hi] = polygonZRange(poly);
    expect(lo).toBeCloseTo(0.99);
    expect(hi).toBeCloseTo(1.02);
  });
  it('accepts small z noise only', () => {
    expect(isHorizontal(poly, 0.05)).toBe(true);
    expect(isHorizontal(poly, 0.01)).toBe(false);
  });
});

describe('openRing2d', () => {
  it('drops the closing vertex and consecutive duplicates, swapping to (lng, lat)', () => {
    expect(openRing2d([[1, 10, 0], [1, 11, 0], [1, 11, 0], [2, 11, 0], [1, 10, 0]])).toEqual([10, 1, 11, 1, 11, 2]);
  });
});

describe('signedArea2d / orientRing', () => {
  const ccw = [0, 0, 2, 0, 2, 1, 0, 1];
  it('is positive for counter-clockwise rings', () => {
    expect(signedArea2d(ccw)).toBe(2);
    expect(signedArea2d([0, 0, 0, 1, 2, 1, 2, 0])).toBe(-2);
  });
  it('reverses only when needed', () => {
    expect(orientRing(ccw, true)).toBe(ccw);
    expect(orientRing(ccw, false)).toEqual([0, 1, 2, 1, 2, 0, 0, 0]);
  });
});

describe('lod1Prism', () => {
  it('uses the lowest horizontal face and the max z', () => {
    const r = lod1Prism(extractLod1Polygons(LOD1_ONLY_BUILDING));
    if (!('prism' in r)) throw new Error(`skipped: ${r.skip}`);
    expect(r.prism.groundElevation).toBe(2);
    expect(r.prism.height).toBe(10);
    expect(Array.from(r.prism.rings)).toEqual([4]);
    expect(signedArea2d(r.prism.coords)).toBeGreaterThan(0);
    // all four corners, as (lng, lat)
    const pts = Array.from({ length: 4 }, (_, i) => [r.prism.coords[i * 2 + 1], r.prism.coords[i * 2]]);
    expect(pts.sort()).toEqual([...corners].sort());
  });

  it('keeps courtyards as CW holes and ignores LOD2', () => {
    const r = lod1Prism(extractLod1Polygons(COURTYARD_BUILDING));
    if (!('prism' in r)) throw new Error(`skipped: ${r.skip}`);
    expect(r.prism.groundElevation).toBe(3);
    expect(r.prism.height).toBe(18);
    expect(Array.from(r.prism.rings)).toEqual([4, (4 | RING_HOLE) >>> 0]);
    expect(signedArea2d(r.prism.coords.subarray(0, 8))).toBeGreaterThan(0);
    expect(signedArea2d(r.prism.coords.subarray(8, 16))).toBeLessThan(0);
  });

  it('keeps every footprint part at the lowest level', () => {
    const a = flat([[0, 0], [0, 1], [1, 1], [1, 0], [0, 0]], 5);
    const b = flat([[2, 0], [2, 1], [3, 1], [3, 0], [2, 0]], 5.01);
    const top = flat([[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]], 9);
    const r = lod1Prism([{ exterior: a, interiors: [] }, { exterior: b, interiors: [] }, { exterior: top, interiors: [] }]);
    if (!('prism' in r)) throw new Error(`skipped: ${r.skip}`);
    expect(Array.from(r.prism.rings)).toEqual([4, 4]);
    expect(r.prism.groundElevation).toBe(5);
    expect(r.prism.height).toBe(4);
  });

  it('reports why a building is skipped', () => {
    expect(lod1Prism([])).toEqual({ skip: 'noPolygons' });
    const wall: GmlPolygon = { exterior: [[0, 0, 0], [0, 1, 0], [0, 1, 5], [0, 0, 5], [0, 0, 0]], interiors: [] };
    expect(lod1Prism([wall])).toEqual({ skip: 'noHorizontalFace' });
    // the LOD2 fixture's lod1Solid is a lone roof polygon
    expect(lod1Prism(extractLod1Polygons(LOD2_BUILDING))).toEqual({ skip: 'flat' });
    const sliver: GmlPolygon = { exterior: [[0, 0, 0], [0, 1, 0], [0, 2, 0], [0, 0, 0]], interiors: [] };
    expect(lod1Prism([sliver, wall])).toEqual({ skip: 'degenerate' });
  });
});
