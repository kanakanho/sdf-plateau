/** Builds the brick indirection table (slot index or empty flag + Chebyshev skip distance). */
import { chebyshevDistance3D } from './distanceTransform';
import { type GridSpec, brickCount } from './gridSpec';

export const BRICK_EMPTY_FLAG = 0x80000000;

export const buildIndirection = (spec: GridSpec, slotBricks: Uint32Array, cap = 255): Uint32Array => {
  const n = brickCount(spec);
  const occ = new Uint8Array(n);
  for (const b of slotBricks) occ[b] = 1;
  const dist = chebyshevDistance3D(occ, spec.dims, cap);
  const table = new Uint32Array(n);
  for (let i = 0; i < n; i++) table[i] = (BRICK_EMPTY_FLAG | dist[i]) >>> 0;
  slotBricks.forEach((b, slot) => {
    table[b] = slot;
  });
  return table;
};

export const decodeIndirection = (entry: number): { empty: boolean; value: number } => ({
  empty: (entry & BRICK_EMPTY_FLAG) !== 0,
  value: entry & ~BRICK_EMPTY_FLAG,
});
