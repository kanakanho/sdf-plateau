/** CPU half of the bake (runs in a worker): grid, bins, adaptive refinement, brick table, palettes. */
import { computeAtlasLayout, type AtlasLayout } from './atlasLayout';
import { type BrickBins, binTriangles } from './binning';
import { type GridSpec, computeGridSpec } from './gridSpec';
import { buildIndirection } from './indirection';
import { type SlotPalettes, buildSlotPalettes } from './palette';
import { assembleAdaptive, planRefinement } from './refine';

export type PreparedBake = {
  readonly spec: GridSpec;
  readonly bins: BrickBins;
  readonly layout: AtlasLayout;
  readonly brickTable: Uint32Array;
  readonly palettes: SlotPalettes;
  /** per slot: brick min corner xyz and voxel size */
  readonly slotDescs: Float32Array;
  readonly refineFactor: number;
  readonly refinedBricks: number;
};

export type RefineOptions = {
  /** children per axis for refined bricks (1 disables refinement) */
  readonly refineFactor?: number;
  /** upper bound on the total number of atlas slots */
  readonly maxSlots?: number;
  readonly minScore?: number;
};

export const prepareBake = (
  positions: Float32Array,
  triInfo: Uint32Array,
  boundsMin: readonly number[],
  boundsMax: readonly number[],
  voxelSize: number,
  options: RefineOptions = {},
): PreparedBake =>
  // the ground plane (z = 0) is the lower limit of interest
  prepareBakeOnGrid(positions, triInfo, computeGridSpec([boundsMin[0], boundsMin[1], Math.min(boundsMin[2], 0)], boundsMax, { voxelSize }), options);

/**
 * Same as prepareBake on a given grid (e.g. one tile of a streamed area). Triangles may extend
 * beyond the grid: they still shape the distances near its faces, but get no bricks outside it.
 */
export const prepareBakeOnGrid = (
  positions: Float32Array,
  triInfo: Uint32Array,
  spec: GridSpec,
  { refineFactor = 2, maxSlots = 280_000, minScore = 16 }: RefineOptions = {},
): PreparedBake => {
  const coarse = binTriangles(positions, spec);
  const plan = refineFactor > 1 ? planRefinement(positions, coarse, spec, refineFactor, maxSlots, minScore) : new Map();
  const adaptive = assembleAdaptive(spec, coarse, buildIndirection(spec, coarse.slotBricks), plan, refineFactor);
  return {
    spec,
    bins: adaptive.bins,
    layout: computeAtlasLayout(adaptive.bins.slotBricks.length),
    brickTable: adaptive.brickTable,
    palettes: buildSlotPalettes(adaptive.bins, triInfo),
    slotDescs: adaptive.slotDescs,
    refineFactor,
    refinedBricks: adaptive.refinedBricks,
  };
};

/** ArrayBuffers that can be transferred (not copied) out of the worker. */
export const transferablesOf = (p: PreparedBake): ArrayBuffer[] =>
  [
    p.bins.slotBricks,
    p.bins.triOffsets,
    p.bins.triIndices,
    p.brickTable,
    p.palettes.triPaletteIndex,
    p.palettes.paletteOffsets,
    p.palettes.palette,
    p.slotDescs,
  ].map((a) => a.buffer as ArrayBuffer);
