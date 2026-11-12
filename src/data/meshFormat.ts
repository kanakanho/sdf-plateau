/**
 * Binary city mesh format shared by the preprocessor (writer) and the viewer (reader).
 *
 * header  : 16 x u32 (64 bytes)
 *   [0] magic 'SDFP'  [1] version  [2] triCount  [3] buildingCount
 *   [4..6] boundsMin (f32)  [7..9] boundsMax (f32)  [10..15] reserved
 * positions      : f32 x triCount*9  (local meters, outward CCW)
 * triInfo        : u32 x triCount    (buildingIndex << 3 | surfaceType)
 * buildingRanges : u32 x buildingCount*2 (triStart, triCount)
 */
export const MESH_MAGIC = 0x50464453; // 'SDFP' little endian
export const MESH_VERSION = 1;
const HEADER_WORDS = 16;

export const SurfaceType = {
  Wall: 0,
  Roof: 1,
  Ground: 2,
  Installation: 3,
  Lod1: 4,
  Other: 5,
} as const;
export type SurfaceTypeCode = (typeof SurfaceType)[keyof typeof SurfaceType];

export type CityMesh = {
  readonly positions: Float32Array;
  readonly triInfo: Uint32Array;
  readonly buildingRanges: Uint32Array;
  readonly boundsMin: [number, number, number];
  readonly boundsMax: [number, number, number];
};

export const packTriInfo = (buildingIndex: number, surfaceType: number): number =>
  ((buildingIndex << 3) | (surfaceType & 7)) >>> 0;

export const unpackTriInfo = (info: number): { buildingIndex: number; surfaceType: number } => ({
  buildingIndex: info >>> 3,
  surfaceType: info & 7,
});

export const computeBounds = (
  positions: Float32Array,
): { min: [number, number, number]; max: [number, number, number] } => {
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < positions.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      const v = positions[i + k];
      if (v < min[k]) min[k] = v;
      if (v > max[k]) max[k] = v;
    }
  }
  return { min, max };
};

export const encodeCityMesh = (mesh: CityMesh): ArrayBuffer => {
  const triCount = mesh.triInfo.length;
  const buildingCount = mesh.buildingRanges.length / 2;
  if (mesh.positions.length !== triCount * 9) throw new Error('positions/triInfo length mismatch');
  const bytes = HEADER_WORDS * 4 + mesh.positions.byteLength + mesh.triInfo.byteLength + mesh.buildingRanges.byteLength;
  const buf = new ArrayBuffer(bytes);
  const header = new Uint32Array(buf, 0, HEADER_WORDS);
  const headerF = new Float32Array(buf, 0, HEADER_WORDS);
  header[0] = MESH_MAGIC;
  header[1] = MESH_VERSION;
  header[2] = triCount;
  header[3] = buildingCount;
  headerF.set(mesh.boundsMin, 4);
  headerF.set(mesh.boundsMax, 7);
  let off = HEADER_WORDS * 4;
  new Float32Array(buf, off, mesh.positions.length).set(mesh.positions);
  off += mesh.positions.byteLength;
  new Uint32Array(buf, off, triCount).set(mesh.triInfo);
  off += mesh.triInfo.byteLength;
  new Uint32Array(buf, off, buildingCount * 2).set(mesh.buildingRanges);
  return buf;
};

export const decodeCityMesh = (buf: ArrayBuffer): CityMesh => {
  const header = new Uint32Array(buf, 0, HEADER_WORDS);
  if (header[0] !== MESH_MAGIC) throw new Error('not an SDFP mesh');
  if (header[1] !== MESH_VERSION) throw new Error(`unsupported mesh version ${header[1]}`);
  const triCount = header[2];
  const buildingCount = header[3];
  const headerF = new Float32Array(buf, 0, HEADER_WORDS);
  let off = HEADER_WORDS * 4;
  const positions = new Float32Array(buf, off, triCount * 9);
  off += positions.byteLength;
  const triInfo = new Uint32Array(buf, off, triCount);
  off += triInfo.byteLength;
  const buildingRanges = new Uint32Array(buf, off, buildingCount * 2);
  return {
    positions,
    triInfo,
    buildingRanges,
    boundsMin: [headerF[4], headerF[5], headerF[6]],
    boundsMax: [headerF[7], headerF[8], headerF[9]],
  };
};
