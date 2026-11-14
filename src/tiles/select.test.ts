import { describe, expect, it } from 'vitest';
import { attributeRuns, convexOverlapsRect, selectTiles, tileKey } from './select';

describe('convexOverlapsRect', () => {
  const tri: [number, number][] = [[0, 0], [10, 0], [0, 10]];
  it('detects overlap, containment and separation', () => {
    expect(convexOverlapsRect(tri, 1, 1, 2, 2)).toBe(true);
    expect(convexOverlapsRect(tri, -5, -5, 20, 20)).toBe(true);
    expect(convexOverlapsRect(tri, 6, 6, 9, 9)).toBe(false); // beyond the hypotenuse, inside the bbox
    expect(convexOverlapsRect(tri, 11, 0, 12, 1)).toBe(false);
    expect(convexOverlapsRect([], 0, 0, 1, 1)).toBe(false);
  });
});

describe('selectTiles', () => {
  const m = {
    grid: { originX: 0, originY: 0, nx: 4, ny: 4 },
    tileSize: 100,
    tiles: [
      { ix: 0, iy: 0, buildingStart: 0, count: 1, maxZ: 1 },
      { ix: 1, iy: 0, buildingStart: 1, count: 1, maxZ: 1 },
      { ix: 3, iy: 0, buildingStart: 2, count: 1, maxZ: 1 },
      { ix: 2, iy: 3, buildingStart: 3, count: 1, maxZ: 1 },
    ],
  };
  const polygon: [number, number][] = [[0, 0], [250, 0], [250, 80], [0, 80]];
  it('keeps overlapping non-empty tiles, nearest first, up to the limit', () => {
    const view = { camera: [230, 40, 100] as [number, number, number], polygon };
    expect(selectTiles(m, view, 10)).toEqual([tileKey(m, 1, 0), tileKey(m, 0, 0)]);
    expect(selectTiles(m, view, 1)).toEqual([tileKey(m, 1, 0)]);
  });
});

describe('attributeRuns', () => {
  it('groups consecutive indices (in any order) and drops duplicates', () => {
    const attrs = Float32Array.from([5, 5, 5, 5, 3, 3, 3, 3, 4, 4, 4, 4, 9, 9, 9, 9, 3, 3, 3, 3]);
    const runs = attributeRuns(Uint32Array.of(5, 3, 4, 9, 3), attrs);
    expect(runs.map((r) => r.start)).toEqual([3, 9]);
    expect(Array.from(runs[0].data)).toEqual([3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5]);
    expect(Array.from(runs[1].data)).toEqual([9, 9, 9, 9]);
  });
});
