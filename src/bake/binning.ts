/**
 * Assigns triangles to bricks.
 * - A brick is *occupied* when some triangle lies within `occupancyMargin` of its box.
 * - Each occupied brick gets the list of triangles within `truncation` of its box, which is
 *   enough to compute exact distances up to the truncation band at its samples.
 * Slots are assigned to occupied bricks in ascending brick index order.
 */
import { triBoxOverlap } from '../geom/triBox';
import type { V3 } from '../geom/vec3';
import { type GridSpec, brickLinearIndex } from './gridSpec';

export type BrickBins = {
  /** brick linear index per slot (ascending) */
  readonly slotBricks: Uint32Array;
  /** CSR offsets into triIndices, length slotCount + 1 */
  readonly triOffsets: Uint32Array;
  readonly triIndices: Uint32Array;
};

const clampInt = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export const binTriangles = (positions: Float32Array, spec: GridSpec): BrickBins => {
  const lists = new Map<number, number[]>();
  const occupied = new Set<number>();
  const half = spec.brickWorld / 2;
  const listHalf: V3 = [half + spec.truncation, half + spec.truncation, half + spec.truncation];
  const occHalf: V3 = [half + spec.occupancyMargin, half + spec.occupancyMargin, half + spec.occupancyMargin];
  const triCount = positions.length / 9;
  for (let t = 0; t < triCount; t++) {
    const o = t * 9;
    const a: V3 = [positions[o], positions[o + 1], positions[o + 2]];
    const b: V3 = [positions[o + 3], positions[o + 4], positions[o + 5]];
    const c: V3 = [positions[o + 6], positions[o + 7], positions[o + 8]];
    const lo = [0, 1, 2].map((k) =>
      clampInt(Math.floor((Math.min(a[k], b[k], c[k]) - spec.truncation - spec.origin[k]) / spec.brickWorld), 0, spec.dims[k] - 1),
    );
    const hi = [0, 1, 2].map((k) =>
      clampInt(Math.floor((Math.max(a[k], b[k], c[k]) + spec.truncation - spec.origin[k]) / spec.brickWorld), 0, spec.dims[k] - 1),
    );
    for (let z = lo[2]; z <= hi[2]; z++) {
      for (let y = lo[1]; y <= hi[1]; y++) {
        for (let x = lo[0]; x <= hi[0]; x++) {
          const center: V3 = [
            spec.origin[0] + (x + 0.5) * spec.brickWorld,
            spec.origin[1] + (y + 0.5) * spec.brickWorld,
            spec.origin[2] + (z + 0.5) * spec.brickWorld,
          ];
          if (!triBoxOverlap(center, listHalf, a, b, c)) continue;
          const idx = brickLinearIndex(spec, x, y, z);
          let list = lists.get(idx);
          if (!list) lists.set(idx, (list = []));
          list.push(t);
          if (!occupied.has(idx) && triBoxOverlap(center, occHalf, a, b, c)) occupied.add(idx);
        }
      }
    }
  }
  const slotBricks = Uint32Array.from([...occupied].sort((p, q) => p - q));
  const triOffsets = new Uint32Array(slotBricks.length + 1);
  let total = 0;
  slotBricks.forEach((brick, s) => {
    triOffsets[s] = total;
    total += lists.get(brick)!.length;
  });
  triOffsets[slotBricks.length] = total;
  const triIndices = new Uint32Array(total);
  slotBricks.forEach((brick, s) => triIndices.set(lists.get(brick)!, triOffsets[s]));
  return { slotBricks, triOffsets, triIndices };
};
