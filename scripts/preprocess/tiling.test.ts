import { describe, expect, it } from 'vitest';
import { RING_HOLE } from '../../src/data/tileFormat';
import { assignBuildings, footprintCentroid, gridFromBounds, tileMargin, tileOf, tilesOverlapping, type TileGrid } from './tiling';

const grid: TileGrid = { originX: -1024, originY: -1024, tileSize: 1024, nx: 2, ny: 2 };

describe('tileMargin', () => {
  it('is truncation + one voxel', () => {
    expect(tileMargin(2)).toBe(10);
    expect(tileMargin(1, 2)).toBe(3);
  });
});

describe('gridFromBounds', () => {
  it('aligns the origin to tile multiples and covers the margin', () => {
    expect(gridFromBounds([-500, 3], [500, 1000], 1024, 10)).toEqual({
      originX: -1024,
      originY: -1024,
      tileSize: 1024,
      nx: 2,
      ny: 2,
    });
  });
  it('makes a single tile for small data', () => {
    expect(gridFromBounds([100, 100], [200, 200], 1024, 10)).toMatchObject({ originX: 0, originY: 0, nx: 1, ny: 1 });
  });
});

describe('tileOf', () => {
  it('floors relative to the grid origin', () => {
    expect(tileOf(grid, -1024, -1024)).toEqual([0, 0]);
    expect(tileOf(grid, -0.001, 0)).toEqual([0, 1]);
    expect(tileOf(grid, 1023.9, -1)).toEqual([1, 0]);
    expect(tileOf(grid, 2000, -2000)).toEqual([2, -1]);
  });
});

describe('tilesOverlapping', () => {
  it('returns the single tile of an interior box', () => {
    expect(tilesOverlapping(grid, [100, 100], [120, 130], 10)).toEqual([3]);
  });
  it('includes neighbours reached only by the margin', () => {
    expect(tilesOverlapping(grid, [5, 100], [20, 120], 10)).toEqual([2, 3]);
    expect(tilesOverlapping(grid, [11, 100], [20, 120], 10)).toEqual([3]);
  });
  it('covers all four tiles around the centre and clamps to the grid', () => {
    expect(tilesOverlapping(grid, [-5, -5], [5, 5], 0)).toEqual([0, 1, 2, 3]);
    expect(tilesOverlapping(grid, [-5000, -5000], [-4000, -4000], 0)).toEqual([0]);
  });
});

describe('footprintCentroid', () => {
  it('computes the area centroid of a square', () => {
    expect(footprintCentroid([0, 0, 4, 0, 4, 2, 0, 2], [4])).toEqual([2, 1]);
  });
  it('subtracts holes', () => {
    // 4x4 square with the right half's 2x4 hole → remaining left half centroid x = 1
    const xy = [0, 0, 4, 0, 4, 4, 0, 4, 2, 0, 2, 4, 4, 4, 4, 0];
    const [cx, cy] = footprintCentroid(xy, [4, (4 | RING_HOLE) >>> 0]);
    expect(cx).toBeCloseTo(1);
    expect(cy).toBeCloseTo(2);
  });
  it('falls back to the vertex mean for degenerate rings', () => {
    expect(footprintCentroid([0, 0, 2, 0, 4, 0], [3])).toEqual([2, 0]);
    expect(footprintCentroid([], [])).toEqual([0, 0]);
  });
});

describe('assignBuildings', () => {
  // A in tile 3, B in tile 0, C in tile 3 straddling into tile 2, D in tile 1
  const bboxes = [
    100, 100, 110, 110, // A
    -500, -500, -490, -490, // B
    -3, 200, 20, 210, // C
    300, -300, 310, -290, // D
  ];
  const centroids = [105, 105, -495, -495, 8, 205, 305, -295];
  const { order, tiles } = assignBuildings(grid, bboxes, centroids, 10);

  it('orders buildings contiguously per home tile in row-major tile order', () => {
    expect(Array.from(order)).toEqual([1, 3, 0, 2]);
  });
  it('lists home ranges and members per tile', () => {
    expect(tiles.map(({ ix, iy, buildingStart, count }) => ({ ix, iy, buildingStart, count }))).toEqual([
      { ix: 0, iy: 0, buildingStart: 0, count: 1 },
      { ix: 1, iy: 0, buildingStart: 1, count: 1 },
      { ix: 0, iy: 1, buildingStart: 2, count: 0 },
      { ix: 1, iy: 1, buildingStart: 2, count: 2 },
    ]);
    expect(tiles.map((t) => Array.from(t.members))).toEqual([[0], [1], [3], [2, 3]]);
  });
  it('rejects mismatched inputs', () => {
    expect(() => assignBuildings(grid, [0, 0, 1, 1], [0, 0, 1, 1], 0)).toThrow(/mismatch/);
  });
});
