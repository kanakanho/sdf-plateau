import { describe, expect, it } from 'vitest';
import { BRICK_EMPTY_FLAG } from '../bake/indirection';
import { areaGrid, packTilingParams, rebaseBrickTable, tileGridSpec, tilePaletteOffsets, tileTableIndex } from './tileGrid';

const manifest = {
  voxelSize: 2,
  tileSize: 1024,
  grid: { originX: -2048, originY: -1024, nx: 4, ny: 2 },
  tiles: [
    { ix: 0, iy: 0, buildingStart: 0, count: 1, maxZ: 40 },
    { ix: 3, iy: 1, buildingStart: 1, count: 1, maxZ: 120.5 },
  ],
};

describe('areaGrid', () => {
  it('covers all tiles with a common z range from below the bases to above the tallest roof', () => {
    const g = areaGrid(manifest);
    expect(g.tileBricks).toBe(64);
    expect([g.tilesX, g.tilesY]).toEqual([4, 2]);
    expect(g.baseZ).toBe(-6);
    expect(g.spec.origin).toEqual([-2048, -1024, -10]);
    expect(g.spec.brickWorld).toBe(16);
    expect(g.spec.truncation).toBe(8);
    // (120.5 + 4 + 10) / 16 -> 9 bricks
    expect(g.spec.dims).toEqual([256, 128, 9]);
    expect(g.tileEntries).toBe(64 * 64 * 9);
  });

  it('rejects a tile size that is not a whole number of bricks', () => {
    expect(() => areaGrid({ ...manifest, tileSize: 1000 })).toThrow(/multiple/);
  });
});

describe('tileGridSpec / tileTableIndex', () => {
  it('returns the square of one tile and its row-major table index', () => {
    const g = areaGrid(manifest);
    const s = tileGridSpec(g, 3, 1);
    expect(s.origin).toEqual([-2048 + 3 * 1024, -1024 + 1024, -10]);
    expect(s.dims).toEqual([64, 64, 9]);
    expect(s.voxelSize).toBe(2);
    expect(tileTableIndex(g, 3, 1)).toBe(7);
  });
});

describe('rebaseBrickTable', () => {
  it('offsets slot entries and keeps empty entries', () => {
    const empty = (BRICK_EMPTY_FLAG | 3) >>> 0;
    expect(Array.from(rebaseBrickTable(Uint32Array.of(0, empty, 5), 256))).toEqual([256, empty, 261]);
  });
  it('rejects refined bricks', () => {
    expect(() => rebaseBrickTable(Uint32Array.of(0x40000001), 0)).toThrow(/refined/);
  });
});

describe('tilePaletteOffsets', () => {
  it('points each slot into the pool behind the per-slot offset block', () => {
    expect(Array.from(tilePaletteOffsets(Uint32Array.of(0, 2, 5, 6), 1000, 40))).toEqual([1040, 1042, 1045]);
    expect(tilePaletteOffsets(Uint32Array.of(0), 10, 0)).toHaveLength(0);
  });
});

describe('packTilingParams', () => {
  it('matches struct TilingParams', () => {
    expect(Array.from(packTilingParams(areaGrid(manifest)))).toEqual([64, 4, 2, 64 * 64 * 9]);
  });
});
