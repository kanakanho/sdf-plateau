/**
 * Splits an area into fixed square tiles of the local frame (pure functions).
 * Each building has one home tile (the one containing its centroid: attributes, area-wide index
 * range), and its geometry goes to every tile whose square, grown by the SDF margin, overlaps the
 * building's bbox — so a tile that bakes only its own square still sees every nearby surface.
 */
import { ringVertexCount } from '../../src/data/tileFormat';

export const DEFAULT_TILE_SIZE = 1024;
export const TRUNCATION_VOXELS = 4;

export type TileGrid = {
  /** min corner of tile (0, 0) in local meters */
  readonly originX: number;
  readonly originY: number;
  readonly tileSize: number;
  readonly nx: number;
  readonly ny: number;
};

export type TileAssignment = {
  readonly ix: number;
  readonly iy: number;
  /** home buildings are the area-wide indices [buildingStart, buildingStart + count) */
  readonly buildingStart: number;
  readonly count: number;
  /** area-wide indices of every building whose geometry is stored in this tile, ascending */
  readonly members: Uint32Array;
};

/** Distance a tile must look beyond its square: SDF truncation band + one voxel. */
export const tileMargin = (voxelSize: number, truncationVoxels = TRUNCATION_VOXELS): number =>
  (truncationVoxels + 1) * voxelSize;

/** Smallest tile-aligned grid covering [min, max] grown by `margin`; the origin is a multiple of tileSize. */
export const gridFromBounds = (
  min: readonly [number, number],
  max: readonly [number, number],
  tileSize: number,
  margin: number,
): TileGrid => {
  const originX = Math.floor((min[0] - margin) / tileSize) * tileSize;
  const originY = Math.floor((min[1] - margin) / tileSize) * tileSize;
  return {
    originX,
    originY,
    tileSize,
    nx: Math.floor((max[0] + margin - originX) / tileSize) + 1,
    ny: Math.floor((max[1] + margin - originY) / tileSize) + 1,
  };
};

/** Tile containing (x, y); may lie outside the grid. */
export const tileOf = (grid: TileGrid, x: number, y: number): [number, number] => [
  Math.floor((x - grid.originX) / grid.tileSize),
  Math.floor((y - grid.originY) / grid.tileSize),
];

const clampInt = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/** Row-major ids (iy * nx + ix) of the grid tiles overlapping the bbox grown by `margin`. */
export const tilesOverlapping = (
  grid: TileGrid,
  min: readonly [number, number],
  max: readonly [number, number],
  margin: number,
): number[] => {
  const [x0, y0] = tileOf(grid, min[0] - margin, min[1] - margin);
  const [x1, y1] = tileOf(grid, max[0] + margin, max[1] + margin);
  const out: number[] = [];
  for (let iy = clampInt(y0, 0, grid.ny - 1); iy <= clampInt(y1, 0, grid.ny - 1); iy++) {
    for (let ix = clampInt(x0, 0, grid.nx - 1); ix <= clampInt(x1, 0, grid.nx - 1); ix++) out.push(iy * grid.nx + ix);
  }
  return out;
};

/**
 * Area centroid of footprint rings (x, y pairs; ring codes as in tileFormat). Exteriors are CCW and
 * holes CW, so holes subtract;
 * falls back to the vertex mean for degenerate footprints.
 */
export const footprintCentroid = (xy: ArrayLike<number>, rings: ArrayLike<number>): [number, number] => {
  let a = 0, cx = 0, cy = 0, sx = 0, sy = 0;
  let start = 0;
  for (let r = 0; r < rings.length; r++) {
    const n = ringVertexCount(rings[r]);
    for (let i = 0; i < n; i++) {
      const p = (start + i) * 2;
      const q = (start + ((i + 1) % n)) * 2;
      const cross = xy[p] * xy[q + 1] - xy[q] * xy[p + 1];
      a += cross;
      cx += (xy[p] + xy[q]) * cross;
      cy += (xy[p + 1] + xy[q + 1]) * cross;
      sx += xy[p];
      sy += xy[p + 1];
    }
    start += n;
  }
  if (Math.abs(a) > 1e-9) return [cx / (3 * a), cy / (3 * a)];
  return start ? [sx / start, sy / start] : [0, 0];
};

/**
 * Assigns area-wide indices (contiguous per home tile, tiles in row-major order) and tile members.
 * @param bboxes    minX, minY, maxX, maxY per building (input order)
 * @param centroids x, y per building (input order)
 * @returns order[globalIndex] = input index, and the non-empty tiles in row-major order
 */
export const assignBuildings = (
  grid: TileGrid,
  bboxes: ArrayLike<number>,
  centroids: ArrayLike<number>,
  margin: number,
): { order: Uint32Array; tiles: TileAssignment[] } => {
  const n = centroids.length / 2;
  if (bboxes.length !== n * 4) throw new Error('bboxes/centroids length mismatch');
  const tileCount = grid.nx * grid.ny;
  const home = new Uint32Array(n);
  const homeCount = new Uint32Array(tileCount + 1);
  for (let i = 0; i < n; i++) {
    const [ix, iy] = tileOf(grid, centroids[i * 2], centroids[i * 2 + 1]);
    const id = clampInt(iy, 0, grid.ny - 1) * grid.nx + clampInt(ix, 0, grid.nx - 1);
    home[i] = id;
    homeCount[id + 1]++;
  }
  const start = new Uint32Array(tileCount + 1);
  for (let t = 0; t < tileCount; t++) start[t + 1] = start[t] + homeCount[t + 1];
  const cursor = start.slice(0, tileCount);
  const order = new Uint32Array(n);
  const globalOf = new Uint32Array(n);
  for (let i = 0; i < n; i++) {
    const g = cursor[home[i]]++;
    order[g] = i;
    globalOf[i] = g;
  }

  const members = new Map<number, number[]>();
  for (let g = 0; g < n; g++) {
    const i = order[g];
    const ids = tilesOverlapping(
      grid,
      [bboxes[i * 4], bboxes[i * 4 + 1]],
      [bboxes[i * 4 + 2], bboxes[i * 4 + 3]],
      margin,
    );
    for (const id of ids) {
      const list = members.get(id);
      if (list) list.push(g);
      else members.set(id, [g]);
    }
  }

  const tiles: TileAssignment[] = [];
  for (let id = 0; id < tileCount; id++) {
    const list = members.get(id);
    const count = start[id + 1] - start[id];
    if (!list && !count) continue;
    tiles.push({
      ix: id % grid.nx,
      iy: Math.floor(id / grid.nx),
      buildingStart: start[id],
      count,
      // pushed in ascending global order already
      members: new Uint32Array(list ?? []),
    });
  }
  return { order, tiles };
};
