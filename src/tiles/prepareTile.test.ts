import { describe, expect, it } from 'vitest';
import { decodeIndirection } from '../bake/indirection';
import { unpackTriInfo } from '../data/meshFormat';
import { encodeTile } from '../data/tileFormat';
import { areaGrid, tileGridSpec } from './tileGrid';
import { prepareTile, preparedTileTransferables } from './prepareTile';

const grid = areaGrid({
  voxelSize: 2,
  tileSize: 64,
  grid: { originX: 0, originY: 0, nx: 1, ny: 1 },
  tiles: [{ ix: 0, iy: 0, buildingStart: 40, count: 1, maxZ: 20 }],
});

const buf = encodeTile({
  ix: 0,
  iy: 0,
  origin: [0, 0],
  indices: Uint32Array.of(41),
  heights: Float32Array.of(20),
  attributes: Float32Array.of(20, 1, 1990, 1),
  ringCounts: Uint32Array.of(1),
  rings: Uint32Array.of(4),
  positions: Float32Array.of(10, 10, 30, 10, 30, 26, 10, 26),
});

describe('prepareTile', () => {
  const t = prepareTile(buf, tileGridSpec(grid, 0, 0), grid.baseZ);
  it('extrudes the footprints and keeps the area-wide building index', () => {
    expect(t.triCount).toBe(12);
    expect(t.positions.length).toBe(12 * 9);
    expect(new Set(Array.from(t.palettes.palette, (i) => unpackTriInfo(i).buildingIndex))).toEqual(new Set([41]));
    expect(Array.from(t.indices)).toEqual([41]);
    expect(Array.from(t.attributes)).toEqual([20, 1, 1990, 1]);
  });
  it('bins on the tile grid without refinement', () => {
    expect(t.brickTable).toHaveLength(grid.tileEntries);
    const occupied = Array.from(t.brickTable, decodeIndirection).filter((e) => !e.empty);
    expect(occupied.length).toBe(t.bins.slotBricks.length);
    expect(t.slotDescs.length).toBe(t.bins.slotBricks.length * 4);
    expect(t.slotDescs[3]).toBe(2);
  });
  it('lists every typed array as transferable', () => {
    expect(new Set(preparedTileTransferables(t)).size).toBe(11);
  });
});
