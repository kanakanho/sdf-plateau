/**
 * Adaptive resolution: the most detailed coarse bricks are replaced by R³ child bricks with
 * voxel size voxel/R. Children use the same 9³ sample layout and share the atlas with coarse
 * bricks; only occupied children get a slot.
 *
 * Brick table layout (one buffer): [coarse entries (dims.x*dims.y*dims.z) | child entries]
 *   coarse entry: slot index | EMPTY_FLAG + skip distance | REFINED_FLAG + child base index
 *   child entry : slot index | EMPTY_FLAG + 1
 */
import { triBoxOverlap } from '../geom/triBox';
import type { V3 } from '../geom/vec3';
import type { BrickBins } from './binning';
import { type GridSpec, brickCoordFromIndex, brickMin } from './gridSpec';
import { BRICK_EMPTY_FLAG } from './indirection';

export const BRICK_REFINED_FLAG = 0x40000000;

export type ChildBin = { readonly occupied: boolean; readonly list: readonly number[] };

/** Detail score per coarse slot: number of triangles binned within the truncation band. */
export const slotScores = (bins: BrickBins): Uint32Array =>
  Uint32Array.from({ length: bins.slotBricks.length }, (_, s) => bins.triOffsets[s + 1] - bins.triOffsets[s]);

const triAt = (positions: Float32Array, t: number): [V3, V3, V3] => {
  const o = t * 9;
  return [
    [positions[o], positions[o + 1], positions[o + 2]],
    [positions[o + 3], positions[o + 4], positions[o + 5]],
    [positions[o + 6], positions[o + 7], positions[o + 8]],
  ];
};

/** Bins a parent's triangle list into one child box (min corner, edge length `world`). */
export const binChild = (
  positions: Float32Array,
  parentList: ArrayLike<number>,
  min: V3,
  world: number,
  truncation: number,
  occupancyMargin: number,
): ChildBin => {
  const half = world / 2;
  const center: V3 = [min[0] + half, min[1] + half, min[2] + half];
  const listHalf: V3 = [half + truncation, half + truncation, half + truncation];
  const occHalf: V3 = [half + occupancyMargin, half + occupancyMargin, half + occupancyMargin];
  const list: number[] = [];
  let occupied = false;
  const lo0 = center[0] - listHalf[0], lo1 = center[1] - listHalf[1], lo2 = center[2] - listHalf[2];
  const hi0 = center[0] + listHalf[0], hi1 = center[1] + listHalf[1], hi2 = center[2] + listHalf[2];
  for (let i = 0; i < parentList.length; i++) {
    const t = parentList[i];
    const o = t * 9;
    // cheap bounding-box rejection before the separating axis test
    if (Math.max(positions[o], positions[o + 3], positions[o + 6]) < lo0) continue;
    if (Math.min(positions[o], positions[o + 3], positions[o + 6]) > hi0) continue;
    if (Math.max(positions[o + 1], positions[o + 4], positions[o + 7]) < lo1) continue;
    if (Math.min(positions[o + 1], positions[o + 4], positions[o + 7]) > hi1) continue;
    if (Math.max(positions[o + 2], positions[o + 5], positions[o + 8]) < lo2) continue;
    if (Math.min(positions[o + 2], positions[o + 5], positions[o + 8]) > hi2) continue;
    const [a, b, c] = triAt(positions, t);
    if (!triBoxOverlap(center, listHalf, a, b, c)) continue;
    list.push(t);
    if (!occupied && triBoxOverlap(center, occHalf, a, b, c)) occupied = true;
  }
  return { occupied, list };
};

/** Child index (x-fastest) -> child min corner. */
export const childMin = (parentMin: readonly number[], childWorld: number, R: number, i: number): V3 => [
  parentMin[0] + (i % R) * childWorld,
  parentMin[1] + (Math.floor(i / R) % R) * childWorld,
  parentMin[2] + Math.floor(i / (R * R)) * childWorld,
];

export const childrenOf = (
  positions: Float32Array,
  bins: BrickBins,
  spec: GridSpec,
  slot: number,
  R: number,
): ChildBin[] => {
  const parentMin = brickMin(spec, brickCoordFromIndex(spec, bins.slotBricks[slot]));
  const childWorld = spec.brickWorld / R;
  const parentList = bins.triIndices.subarray(bins.triOffsets[slot], bins.triOffsets[slot + 1]);
  return Array.from({ length: R ** 3 }, (_, i) =>
    binChild(positions, parentList, childMin(parentMin, childWorld, R, i), childWorld, spec.truncation / R, spec.occupancyMargin / R),
  );
};

/**
 * Greedy refinement under a total slot budget, most detailed bricks first.
 * Bricks scoring below `minScore` are never refined.
 */
export const planRefinement = (
  positions: Float32Array,
  bins: BrickBins,
  spec: GridSpec,
  R: number,
  maxSlots: number,
  minScore = 16,
): Map<number, ChildBin[]> => {
  const scores = slotScores(bins);
  const order = Array.from(scores.keys())
    .filter((s) => scores[s] >= minScore)
    .sort((a, b) => scores[b] - scores[a] || a - b);
  const plan = new Map<number, ChildBin[]>();
  let total = bins.slotBricks.length;
  for (const slot of order) {
    if (total >= maxSlots) break;
    const children = childrenOf(positions, bins, spec, slot, R);
    const added = children.filter((c) => c.occupied).length - 1;
    if (total + added > maxSlots) continue;
    plan.set(slot, children);
    total += added;
  }
  return plan;
};

export type AdaptiveBricks = {
  /** per slot: parent coarse brick index, CSR triangle lists */
  readonly bins: BrickBins;
  /** per slot: brick min corner xyz and voxel size */
  readonly slotDescs: Float32Array;
  readonly brickTable: Uint32Array;
  readonly refinedBricks: number;
};

/** Builds the final slot list, descriptors and two-level brick table. */
export const assembleAdaptive = (
  spec: GridSpec,
  bins: BrickBins,
  coarseTable: Uint32Array,
  plan: ReadonlyMap<number, ChildBin[]>,
  R: number,
): AdaptiveBricks => {
  const table: number[] = Array.from(coarseTable);
  const slotBricks: number[] = [];
  const descs: number[] = [];
  const lists: (readonly number[] | ArrayLike<number>)[] = [];
  const childWorld = spec.brickWorld / R;
  for (let s = 0; s < bins.slotBricks.length; s++) {
    const brick = bins.slotBricks[s];
    const bmin = brickMin(spec, brickCoordFromIndex(spec, brick));
    const children = plan.get(s);
    if (!children) {
      table[brick] = slotBricks.length;
      slotBricks.push(brick);
      descs.push(bmin[0], bmin[1], bmin[2], spec.voxelSize);
      lists.push(bins.triIndices.subarray(bins.triOffsets[s], bins.triOffsets[s + 1]));
      continue;
    }
    const base = table.length;
    table[brick] = (BRICK_REFINED_FLAG | base) >>> 0;
    children.forEach((child, i) => {
      if (!child.occupied) {
        table.push((BRICK_EMPTY_FLAG | 1) >>> 0);
        return;
      }
      table.push(slotBricks.length);
      const m = childMin(bmin, childWorld, R, i);
      slotBricks.push(brick);
      descs.push(m[0], m[1], m[2], spec.voxelSize / R);
      lists.push(child.list);
    });
  }
  if (table.length >= BRICK_REFINED_FLAG) throw new Error('brick table too large');
  const triOffsets = new Uint32Array(slotBricks.length + 1);
  let total = 0;
  lists.forEach((l, i) => {
    triOffsets[i] = total;
    total += l.length;
  });
  triOffsets[slotBricks.length] = total;
  const triIndices = new Uint32Array(total);
  lists.forEach((l, i) => triIndices.set(l, triOffsets[i]));
  return {
    bins: { slotBricks: Uint32Array.from(slotBricks), triOffsets, triIndices },
    slotDescs: Float32Array.from(descs),
    brickTable: Uint32Array.from(table),
    refinedBricks: plan.size,
  };
};
