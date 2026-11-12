/**
 * Per-brick ID palettes. Each slot keeps the distinct triInfo values (building << 3 | surface type)
 * of its binned triangles; every binned triangle reference gets its index into that palette.
 * The bake then stores one byte per sample (palette index of the nearest triangle).
 */
import type { BrickBins } from './binning';

export const MAX_PALETTE = 256;

export type SlotPalettes = {
  /** palette index (0..255) per entry of bins.triIndices */
  readonly triPaletteIndex: Uint32Array;
  /** CSR offsets into palette, length slotCount + 1 */
  readonly paletteOffsets: Uint32Array;
  /** triInfo values */
  readonly palette: Uint32Array;
};

export const buildSlotPalettes = (bins: BrickBins, triInfo: Uint32Array): SlotPalettes => {
  const slotCount = bins.slotBricks.length;
  const triPaletteIndex = new Uint32Array(bins.triIndices.length);
  const paletteOffsets = new Uint32Array(slotCount + 1);
  const palette: number[] = [];
  for (let s = 0; s < slotCount; s++) {
    paletteOffsets[s] = palette.length;
    const local = new Map<number, number>();
    for (let i = bins.triOffsets[s]; i < bins.triOffsets[s + 1]; i++) {
      const info = triInfo[bins.triIndices[i]];
      let idx = local.get(info);
      if (idx === undefined) {
        // overflow (never seen in practice): reuse the last entry rather than failing
        idx = local.size < MAX_PALETTE ? local.size : MAX_PALETTE - 1;
        if (local.size < MAX_PALETTE) {
          local.set(info, idx);
          palette.push(info);
        }
      }
      triPaletteIndex[i] = idx;
    }
  }
  paletteOffsets[slotCount] = palette.length;
  return { triPaletteIndex, paletteOffsets, palette: Uint32Array.from(palette) };
};

/**
 * Single GPU table: [rebased offsets (slotCount + 1) | palette entries], so the shader needs one
 * storage buffer: entry = table[table[slot] + index].
 */
export const packPaletteTable = (p: SlotPalettes): Uint32Array => {
  const n = p.paletteOffsets.length;
  const out = new Uint32Array(n + p.palette.length);
  for (let i = 0; i < n; i++) out[i] = p.paletteOffsets[i] + n;
  out.set(p.palette, n);
  return out;
};
