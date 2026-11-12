import { describe, expect, it } from 'vitest';
import { boxTriangles } from '../geom/boxMesh';
import { binTriangles } from './binning';
import { brickCoordFromIndex, computeGridSpec } from './gridSpec';

describe('binTriangles', () => {
  // a 4 m cube in the middle of a 5x5x5-brick grid (1 m voxels, 8 m bricks)
  const box = boxTriangles([18, 18, 18], [22, 22, 22]);
  const spec = { ...computeGridSpec([0, 0, 0], [36, 36, 36], { voxelSize: 1, paddingVoxels: 2 }) };

  it('marks only the bricks the surface passes through (plus margin) as occupied', () => {
    const bins = binTriangles(box, spec);
    // grid origin -2 -> cube spans 20..24 in grid space -> bricks x in {2} (16..24), since 24 is a boundary
    const coords = Array.from(bins.slotBricks, (i) => brickCoordFromIndex(spec, i));
    for (const c of coords) for (const k of [0, 1, 2]) expect([2, 3]).toContain(c[k]);
    expect(coords.length).toBeGreaterThan(0);
  });

  it('slot list is sorted and CSR offsets are consistent', () => {
    const bins = binTriangles(box, spec);
    for (let i = 1; i < bins.slotBricks.length; i++) expect(bins.slotBricks[i]).toBeGreaterThan(bins.slotBricks[i - 1]);
    expect(bins.triOffsets).toHaveLength(bins.slotBricks.length + 1);
    expect(bins.triOffsets[bins.triOffsets.length - 1]).toBe(bins.triIndices.length);
  });

  it('every occupied brick lists triangles within the truncation band', () => {
    const bins = binTriangles(box, spec);
    for (let s = 0; s < bins.slotBricks.length; s++) {
      const n = bins.triOffsets[s + 1] - bins.triOffsets[s];
      expect(n).toBeGreaterThan(0);
      expect(n).toBeLessThanOrEqual(12);
    }
  });

  it('a far-away triangle produces no bins', () => {
    const tri = new Float32Array([1000, 1000, 1000, 1001, 1000, 1000, 1000, 1001, 1000]);
    const bins = binTriangles(tri, spec);
    expect(bins.slotBricks.length).toBe(0);
    expect(Array.from(bins.triOffsets)).toEqual([0]);
  });

  it('bricks only within truncation (not occupancy) are not occupied', () => {
    // triangle at the boundary plane x=6 (grid space 8) between brick 0 and 1, so both are occupied;
    // brick 2 (grid 16..24) is 8 m away: farther than truncation 4 m -> not even listed.
    const tri = new Float32Array([6, 1, 1, 6, 4, 1, 6, 1, 4]);
    const bins = binTriangles(tri, spec);
    const xs = Array.from(bins.slotBricks, (i) => brickCoordFromIndex(spec, i)[0]);
    expect(new Set(xs)).toEqual(new Set([0, 1]));
  });
});
