import { describe, expect, it } from 'vitest';
import {
  RING_HOLE,
  TILE_MAGIC,
  type TileBuildings,
  attributeVec4,
  decodeTile,
  encodeTile,
  isHoleRing,
  ringVertexCount,
  tileRingOffsets,
} from './tileFormat';

describe('ringVertexCount / isHoleRing', () => {
  it('splits the hole flag from the count', () => {
    expect(ringVertexCount(5)).toBe(5);
    expect(isHoleRing(5)).toBe(false);
    expect(ringVertexCount((4 | RING_HOLE) >>> 0)).toBe(4);
    expect(isHoleRing((4 | RING_HOLE) >>> 0)).toBe(true);
  });
});

describe('attributeVec4', () => {
  it('prefers measuredHeight and maps usage to its category', () => {
    expect(attributeVec4({ measuredHeight: 30, usage: '401', yearOfConstruction: 1999 }, 12, 1)).toEqual([30, 1, 1999, 1]);
  });
  it('falls back to the prism height and zeros', () => {
    expect(attributeVec4({}, 12, 1)).toEqual([12, 0, 0, 1]);
  });
});

describe('tileRingOffsets', () => {
  it('computes ring and vertex prefix sums', () => {
    const { ringStart, vertexStart } = tileRingOffsets([2, 0, 1], [4, (3 | RING_HOLE) >>> 0, 5]);
    expect(Array.from(ringStart)).toEqual([0, 2, 2, 3]);
    expect(Array.from(vertexStart)).toEqual([0, 4, 7, 12]);
  });
});

describe('encodeTile / decodeTile', () => {
  // building 7: square with a triangular hole; building 9: far outside the tile (still encodable)
  const tile: TileBuildings = {
    ix: 2,
    iy: -1,
    origin: [1024, -1024],
    indices: new Uint32Array([7, 9]),
    heights: new Float32Array([12.5, 40]),
    attributes: new Float32Array([12.5, 4, 1980, 1, 41, 1, 0, 1]),
    ringCounts: new Uint32Array([2, 1]),
    rings: new Uint32Array([4, (3 | RING_HOLE) >>> 0, 3]),
    positions: new Float32Array([
      1030.01, -1000, 1040, -1000, 1040, -990.03, 1030.01, -990.03,
      1032, -998, 1032, -992, 1035, -995,
      2900.5, 100.25, 2910, 100.25, 2905, 110,
    ]),
  };
  const decoded = decodeTile(encodeTile(tile));

  it('round-trips header and per-building sections exactly', () => {
    expect(decoded.ix).toBe(2);
    expect(decoded.iy).toBe(-1);
    expect(decoded.origin).toEqual([1024, -1024]);
    expect(Array.from(decoded.indices)).toEqual([7, 9]);
    expect(Array.from(decoded.heights)).toEqual([12.5, 40]);
    expect(Array.from(decoded.attributes)).toEqual(Array.from(tile.attributes));
    expect(Array.from(decoded.ringCounts)).toEqual([2, 1]);
    expect(Array.from(decoded.rings)).toEqual(Array.from(tile.rings));
  });
  it('round-trips vertices within half a quantization step', () => {
    expect(decoded.positions.length).toBe(tile.positions.length);
    tile.positions.forEach((p, i) => expect(Math.abs(decoded.positions[i] - p)).toBeLessThanOrEqual(0.0101));
  });
  it('writes the magic number', () => {
    expect(new Uint32Array(encodeTile(tile), 0, 1)[0]).toBe(TILE_MAGIC);
  });
  it('handles an empty tile', () => {
    const empty: TileBuildings = {
      ...tile,
      indices: new Uint32Array(0),
      heights: new Float32Array(0),
      attributes: new Float32Array(0),
      ringCounts: new Uint32Array(0),
      rings: new Uint32Array(0),
      positions: new Float32Array(0),
    };
    expect(decodeTile(encodeTile(empty)).indices.length).toBe(0);
  });
  it('rejects foreign buffers and inconsistent input', () => {
    expect(() => decodeTile(new ArrayBuffer(64))).toThrow(/SDFT/);
    expect(() => encodeTile({ ...tile, heights: new Float32Array(1) })).toThrow(/mismatch/);
    expect(() => encodeTile({ ...tile, ringCounts: new Uint32Array([1, 1]) })).toThrow(/ringCount/);
    expect(() => encodeTile({ ...tile, positions: new Float32Array(4) })).toThrow(/vertexCount/);
  });
  it('rejects buildings wider than the int16 range', () => {
    const wide = { ...tile, positions: tile.positions.map((p, i) => (i === 2 ? 1030 + 700 : p)) };
    expect(() => encodeTile(wide)).toThrow(/int16/);
  });
});
