import { describe, expect, it } from 'vitest';
import { boxTriangles } from '../geom/boxMesh';
import { decodeIndirection } from './indirection';
import { prepareBake, transferablesOf } from './prepare';

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
