import { describe, expect, it } from 'vitest';
import { brickCoordFromIndex, brickCount, brickLinearIndex, brickMin, computeGridSpec } from './gridSpec';

const spec = computeGridSpec([0, 0, 0], [30, 10, 5], { voxelSize: 1 });

describe('computeGridSpec', () => {
  it('pads the bounds and rounds up to whole bricks', () => {
    expect(spec.origin).toEqual([-2, -2, -2]);
    expect(spec.brickWorld).toBe(8);
    expect(spec.dims).toEqual([5, 2, 2]); // (30+4)/8 -> 5, (10+4)/8 -> 2, (5+4)/8 -> 2
    expect(spec.truncation).toBe(4);
    expect(spec.occupancyMargin).toBe(1);
  });
  it('scales with voxel size', () => {
    const s = computeGridSpec([0, 0, 0], [30, 10, 5], { voxelSize: 0.5, truncationVoxels: 6 });
    expect(s.brickWorld).toBe(4);
    expect(s.truncation).toBe(3);
  });
});

describe('brick indexing', () => {
  it('brickCount multiplies dims', () => {
    expect(brickCount(spec)).toBe(20);
  });
  it('linear index and coordinates round-trip', () => {
    for (const c of [[0, 0, 0], [4, 1, 1], [2, 0, 1]] as const) {
      expect(brickCoordFromIndex(spec, brickLinearIndex(spec, c[0], c[1], c[2]))).toEqual([...c]);
    }
  });
  it('brickMin offsets by whole bricks', () => {
    expect(brickMin(spec, [1, 0, 1])).toEqual([6, -2, 6]);
  });
});
