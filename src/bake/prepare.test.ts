import { describe, expect, it } from 'vitest';
import { boxTriangles } from '../geom/boxMesh';
import { decodeIndirection } from './indirection';
import { computeGridSpec } from './gridSpec';
import { prepareBake, prepareBakeOnGrid, transferablesOf } from './prepare';

describe('prepareBake', () => {
  const box = boxTriangles([0, 0, 2], [10, 10, 12]);
  const p = prepareBake(box, new Uint32Array(12).fill(9), [0, 0, 2], [10, 10, 12], 1);
  it('extends the grid down to the ground plane', () => {
    expect(p.spec.origin[2]).toBeLessThanOrEqual(0);
  });
  it('produces consistent bins, layout and indirection', () => {
    expect(p.bins.slotBricks.length).toBeGreaterThan(0);
    expect(p.layout.slotsX).toBe(128);
    const occupied = Array.from(p.brickTable, decodeIndirection).filter((e) => !e.empty);
    expect(occupied).toHaveLength(p.bins.slotBricks.length);
  });
  it('builds per-slot palettes from the triangle info', () => {
    expect(p.palettes.paletteOffsets).toHaveLength(p.bins.slotBricks.length + 1);
    expect(new Set(p.palettes.palette)).toEqual(new Set([9]));
  });
  it('lists the transferable buffers', () => {
    expect(transferablesOf(p)).toHaveLength(8);
    expect(transferablesOf(p)[0]).toBe(p.bins.slotBricks.buffer);
  });
});

describe('prepareBakeOnGrid', () => {
  it('keeps the given grid and only allocates bricks inside it', () => {
    // a 20 m box straddling x = 8; the grid covers x in [0, 8)
    const box = boxTriangles([-2, 0, 0], [18, 8, 8]);
    const spec = { ...computeGridSpec([0, 0, 0], [8, 8, 8], { voxelSize: 1, paddingVoxels: 0 }), dims: [1, 1, 1] as [number, number, number] };
    const p = prepareBakeOnGrid(box, new Uint32Array(12).fill(3), spec, { refineFactor: 1 });
    expect(p.spec).toBe(spec);
    expect(p.brickTable).toHaveLength(1);
    expect(p.bins.slotBricks.length).toBe(1);
    expect(p.refinedBricks).toBe(0);
  });
});
