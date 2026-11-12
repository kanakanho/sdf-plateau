/** Sparse brick grid specification. */
export type Vec3 = [number, number, number];

export type GridSpec = {
  readonly origin: Vec3;
  readonly voxelSize: number;
  /** cells per brick edge (samples per edge = brickCells + 1) */
  readonly brickCells: number;
  readonly brickWorld: number;
  readonly dims: Vec3;
  /** SDF values are clamped to ±truncation (meters) */
  readonly truncation: number;
  /** a brick is occupied when a triangle lies within this distance of it (meters) */
  readonly occupancyMargin: number;
};

export type GridOptions = {
  readonly voxelSize: number;
  readonly brickCells?: number;
  readonly truncationVoxels?: number;
  readonly paddingVoxels?: number;
};

export const computeGridSpec = (
  boundsMin: readonly number[],
  boundsMax: readonly number[],
  { voxelSize, brickCells = 8, truncationVoxels = 4, paddingVoxels = 2 }: GridOptions,
): GridSpec => {
  const brickWorld = voxelSize * brickCells;
  const pad = paddingVoxels * voxelSize;
  const origin: Vec3 = [boundsMin[0] - pad, boundsMin[1] - pad, boundsMin[2] - pad];
  const dims = [0, 1, 2].map((k) => Math.max(1, Math.ceil((boundsMax[k] + pad - origin[k]) / brickWorld))) as Vec3;
  return {
    origin,
    voxelSize,
    brickCells,
    brickWorld,
    dims,
    truncation: truncationVoxels * voxelSize,
    occupancyMargin: voxelSize,
  };
};

export const brickCount = (spec: GridSpec): number => spec.dims[0] * spec.dims[1] * spec.dims[2];

export const brickLinearIndex = (spec: GridSpec, x: number, y: number, z: number): number =>
  (z * spec.dims[1] + y) * spec.dims[0] + x;

export const brickCoordFromIndex = (spec: GridSpec, i: number): Vec3 => {
  const x = i % spec.dims[0];
  const y = Math.floor(i / spec.dims[0]) % spec.dims[1];
  const z = Math.floor(i / (spec.dims[0] * spec.dims[1]));
  return [x, y, z];
};

export const brickMin = (spec: GridSpec, c: readonly number[]): Vec3 => [
  spec.origin[0] + c[0] * spec.brickWorld,
  spec.origin[1] + c[1] * spec.brickWorld,
  spec.origin[2] + c[2] * spec.brickWorld,
];
