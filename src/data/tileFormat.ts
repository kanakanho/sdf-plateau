/**
 * Binary LOD1 tile format (one 1024 m square of an area), written by the area preprocessor and read
 * by the tile streamer. Buildings are stored as footprint rings + height and extruded at load time.
 *
 * header  : 16 x u32 (64 bytes)
 *   [0] magic 'SDFT'  [1] version  [2] buildingCount  [3] ringCount  [4] vertexCount
 *   [5] ix (i32)  [6] iy (i32)  [7..8] tile origin x, y (f32, local meters)  [9..15] reserved
 * indices    : u32 x buildingCount    (area-wide building index)
 * heights    : f32 x buildingCount    (roof height above the footprint, meters)
 * attributes : f32 x buildingCount*4  (GPU vec4: height, usage category, year, lod)
 * ringCounts : u32 x buildingCount    (rings per building)
 * anchors    : i32 x buildingCount*2  (building's first vertex, UNIT steps from the tile origin)
 * rings      : u32 x ringCount        (vertex count | RING_HOLE for interiors)
 * vertices   : i16 x vertexCount*2    (x, y in UNIT steps from the building anchor)
 *
 * Coordinates are quantized to TILE_UNIT (2 cm). They are relative to a per-building anchor rather
 * than the tile origin directly, so buildings that stick far out of the tile still fit in int16.
 */
import { usageCategory } from './buildings';

export const TILE_MAGIC = 0x54464453; // 'SDFT' little endian
export const TILE_VERSION = 1;
export const TILE_UNIT = 0.02;
export const RING_HOLE = 0x80000000;
const HEADER_WORDS = 16;

export type TileBuildings = {
  readonly ix: number;
  readonly iy: number;
  /** min corner of the tile square in the area's local frame [m] */
  readonly origin: readonly [number, number];
  readonly indices: Uint32Array;
  readonly heights: Float32Array;
  readonly attributes: Float32Array;
  readonly ringCounts: Uint32Array;
  readonly rings: Uint32Array;
  /** (x, y) pairs in the area's local frame [m] */
  readonly positions: Float32Array;
};

export const ringVertexCount = (ring: number): number => ring & 0x7fffffff;
export const isHoleRing = (ring: number): boolean => (ring & RING_HOLE) !== 0;

/** Same layout as `buildingAttributeArray` (src/render/frame.ts) for one building. */
export const attributeVec4 = (
  attrs: { readonly measuredHeight?: number; readonly usage?: string; readonly yearOfConstruction?: number },
  height: number,
  lod: number,
): [number, number, number, number] => [
  attrs.measuredHeight ?? height,
  usageCategory(attrs.usage),
  attrs.yearOfConstruction ?? 0,
  lod,
];

/** Prefix sums: first ring of each building and first vertex of each ring (with a trailing total). */
export const tileRingOffsets = (
  ringCounts: ArrayLike<number>,
  rings: ArrayLike<number>,
): { ringStart: Uint32Array; vertexStart: Uint32Array } => {
  const ringStart = new Uint32Array(ringCounts.length + 1);
  for (let b = 0; b < ringCounts.length; b++) ringStart[b + 1] = ringStart[b] + ringCounts[b];
  const vertexStart = new Uint32Array(rings.length + 1);
  for (let r = 0; r < rings.length; r++) vertexStart[r + 1] = vertexStart[r] + ringVertexCount(rings[r]);
  return { ringStart, vertexStart };
};

const quantize = (v: number, origin: number): number => Math.round((v - origin) / TILE_UNIT);

export const encodeTile = (tile: TileBuildings): ArrayBuffer => {
  const b = tile.indices.length;
  const r = tile.rings.length;
  const v = tile.positions.length / 2;
  if (tile.heights.length !== b || tile.attributes.length !== b * 4 || tile.ringCounts.length !== b) {
    throw new Error('per-building array length mismatch');
  }
  const { ringStart, vertexStart } = tileRingOffsets(tile.ringCounts, tile.rings);
  if (ringStart[b] !== r) throw new Error('ringCounts do not sum to ringCount');
  if (vertexStart[r] !== v) throw new Error('ring vertex counts do not sum to vertexCount');

  const bytes = HEADER_WORDS * 4 + b * 4 * 9 + r * 4 + v * 4;
  const buf = new ArrayBuffer(bytes);
  const header = new Uint32Array(buf, 0, HEADER_WORDS);
  const headerI = new Int32Array(buf, 0, HEADER_WORDS);
  const headerF = new Float32Array(buf, 0, HEADER_WORDS);
  header[0] = TILE_MAGIC;
  header[1] = TILE_VERSION;
  header[2] = b;
  header[3] = r;
  header[4] = v;
  headerI[5] = tile.ix;
  headerI[6] = tile.iy;
  headerF[7] = tile.origin[0];
  headerF[8] = tile.origin[1];
  let off = HEADER_WORDS * 4;
  new Uint32Array(buf, off, b).set(tile.indices);
  off += b * 4;
  new Float32Array(buf, off, b).set(tile.heights);
  off += b * 4;
  new Float32Array(buf, off, b * 4).set(tile.attributes);
  off += b * 16;
  new Uint32Array(buf, off, b).set(tile.ringCounts);
  off += b * 4;
  const anchors = new Int32Array(buf, off, b * 2);
  off += b * 8;
  new Uint32Array(buf, off, r).set(tile.rings);
  off += r * 4;
  const verts = new Int16Array(buf, off, v * 2);

  const [ox, oy] = [headerF[7], headerF[8]];
  for (let bi = 0; bi < b; bi++) {
    const first = vertexStart[ringStart[bi]];
    const last = vertexStart[ringStart[bi + 1]];
    if (first === last) continue;
    const ax = quantize(tile.positions[first * 2], ox);
    const ay = quantize(tile.positions[first * 2 + 1], oy);
    anchors[bi * 2] = ax;
    anchors[bi * 2 + 1] = ay;
    for (let k = first; k < last; k++) {
      const dx = quantize(tile.positions[k * 2], ox) - ax;
      const dy = quantize(tile.positions[k * 2 + 1], oy) - ay;
      if (dx < -32768 || dx > 32767 || dy < -32768 || dy > 32767) {
        throw new Error(`building ${tile.indices[bi]} spans more than int16 x ${TILE_UNIT} m`);
      }
      verts[k * 2] = dx;
      verts[k * 2 + 1] = dy;
    }
  }
  return buf;
};

export const decodeTile = (buf: ArrayBuffer): TileBuildings => {
  const header = new Uint32Array(buf, 0, HEADER_WORDS);
  if (header[0] !== TILE_MAGIC) throw new Error('not an SDFT tile');
  if (header[1] !== TILE_VERSION) throw new Error(`unsupported tile version ${header[1]}`);
  const headerI = new Int32Array(buf, 0, HEADER_WORDS);
  const headerF = new Float32Array(buf, 0, HEADER_WORDS);
  const [b, r, v] = [header[2], header[3], header[4]];
  const origin: [number, number] = [headerF[7], headerF[8]];
  let off = HEADER_WORDS * 4;
  const indices = new Uint32Array(buf, off, b);
  off += b * 4;
  const heights = new Float32Array(buf, off, b);
  off += b * 4;
  const attributes = new Float32Array(buf, off, b * 4);
  off += b * 16;
  const ringCounts = new Uint32Array(buf, off, b);
  off += b * 4;
  const anchors = new Int32Array(buf, off, b * 2);
  off += b * 8;
  const rings = new Uint32Array(buf, off, r);
  off += r * 4;
  const verts = new Int16Array(buf, off, v * 2);

  const { ringStart, vertexStart } = tileRingOffsets(ringCounts, rings);
  const positions = new Float32Array(v * 2);
  for (let bi = 0; bi < b; bi++) {
    const [ax, ay] = [anchors[bi * 2], anchors[bi * 2 + 1]];
    for (let k = vertexStart[ringStart[bi]]; k < vertexStart[ringStart[bi + 1]]; k++) {
      positions[k * 2] = origin[0] + (ax + verts[k * 2]) * TILE_UNIT;
      positions[k * 2 + 1] = origin[1] + (ay + verts[k * 2 + 1]) * TILE_UNIT;
    }
  }
  return { ix: headerI[5], iy: headerI[6], origin, indices, heights, attributes, ringCounts, rings, positions };
};
