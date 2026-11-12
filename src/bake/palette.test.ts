import { describe, expect, it } from 'vitest';
import { MAX_PALETTE, buildSlotPalettes } from './palette';

const bins = (triOffsets: number[], triIndices: number[]) => ({
  slotBricks: new Uint32Array(triOffsets.length - 1),
  triOffsets: Uint32Array.from(triOffsets),
  triIndices: Uint32Array.from(triIndices),
});

describe('buildSlotPalettes', () => {
  it('collects distinct triInfo values per slot and indexes every reference', () => {
    const triInfo = Uint32Array.from([10, 10, 11, 20]);
    const p = buildSlotPalettes(bins([0, 3, 5], [0, 1, 2, 3, 0]), triInfo);
    expect(Array.from(p.paletteOffsets)).toEqual([0, 2, 4]);
    expect(Array.from(p.palette)).toEqual([10, 11, 20, 10]);
    expect(Array.from(p.triPaletteIndex)).toEqual([0, 0, 1, 0, 1]);
  });
  it('handles empty input', () => {
    const p = buildSlotPalettes(bins([0], []), new Uint32Array());
    expect(Array.from(p.paletteOffsets)).toEqual([0]);
    expect(p.palette.length).toBe(0);
  });
  it('caps palettes at 256 entries', () => {
    const n = MAX_PALETTE + 10;
    const triInfo = Uint32Array.from({ length: n }, (_, i) => i);
    const p = buildSlotPalettes(bins([0, n], Array.from({ length: n }, (_, i) => i)), triInfo);
    expect(p.palette.length).toBe(MAX_PALETTE);
    expect(Math.max(...p.triPaletteIndex)).toBe(MAX_PALETTE - 1);
  });
});

describe('packPaletteTable', () => {
  it('stores rebased offsets followed by the palette', async () => {
    const { packPaletteTable } = await import('./palette');
    const t = packPaletteTable({
      triPaletteIndex: new Uint32Array(),
      paletteOffsets: Uint32Array.from([0, 2, 3]),
      palette: Uint32Array.from([10, 11, 20]),
    });
    expect(Array.from(t)).toEqual([3, 5, 6, 10, 11, 20]);
    // lookup: slot 1, index 0 -> table[table[1] + 0]
    expect(t[t[1]]).toBe(20);
  });
});
