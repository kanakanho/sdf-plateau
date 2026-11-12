/** Byte layouts of the uniform blocks used by bake.wgsl, pack.wgsl and sceneTypes.wgsl. */
import type { AtlasLayout } from './atlasLayout';
import type { GridSpec } from './gridSpec';

const writer = (bytes: number) => {
  const buf = new ArrayBuffer(bytes);
  return { buf, f: new Float32Array(buf), u: new Uint32Array(buf) };
};

/** struct BakeParams (16 bytes) */
export const packBakeParams = (truncationVoxels: number, slotBase: number, slotCount: number, groupsX: number): ArrayBuffer => {
  const { buf, f, u } = writer(16);
  f[0] = truncationVoxels;
  u[1] = slotBase;
  u[2] = slotCount;
  u[3] = groupsX;
  return buf;
};

export type PackRegion = {
  readonly width: number;
  readonly rows: number;
  readonly bytesPerRow: number;
  readonly slotCount: number;
};

/** struct PackParams (32 bytes) */
export const packPackParams = (
  region: PackRegion,
  truncation: number,
  slotsX: number,
  groupsX: number,
  mode: 0 | 1 = 0,
): ArrayBuffer => {
  const { buf, f, u } = writer(32);
  u[0] = region.width;
  u[1] = region.rows;
  u[2] = region.bytesPerRow / 4;
  u[3] = region.slotCount;
  f[4] = truncation;
  u[5] = slotsX;
  u[6] = groupsX;
  u[7] = mode;
  return buf;
};

/** struct SceneParams (64 bytes) */
export const packSceneParams = (spec: GridSpec, layout: AtlasLayout, refineFactor: number, slotCount: number): ArrayBuffer => {
  const { buf, f, u } = writer(64);
  f.set(spec.origin, 0);
  f[3] = spec.voxelSize;
  u.set(spec.dims, 4);
  f[7] = spec.truncation;
  f.set(layout.size, 8);
  f[11] = spec.brickWorld;
  u[12] = layout.slotsX;
  u[13] = layout.slotsY;
  u[14] = refineFactor;
  u[15] = slotCount;
  return buf;
};

/** Splits a large 1D dispatch into (x, y) workgroup counts under the 65535 limit. */
export const dispatchSize = (invocations: number, workgroupSize = 64, maxPerDim = 65535): [number, number] => {
  const groups = Math.max(1, Math.ceil(invocations / workgroupSize));
  const x = Math.min(groups, maxPerDim);
  return [x, Math.ceil(groups / x)];
};

export const alignTo = (n: number, a: number): number => Math.ceil(n / a) * a;
