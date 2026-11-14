/**
 * Grid bookkeeping for streamed areas: the whole area is one sparse brick grid split into square
 * tiles of `tileBricks` bricks; every tile is baked on its own grid (same z range for all tiles) and
 * its brick table is copied into a fixed-size block of the shared brick-table pool.
 */
import type { AreaManifest } from '../data/area';
import { BRICK_EMPTY_FLAG } from '../bake/indirection';
import type { GridSpec, Vec3 } from '../bake/gridSpec';

export const BRICK_CELLS = 8;
export const TRUNCATION_VOXELS = 4;
/** building bases are pushed this many voxels below z = 0 (crisp wall feet, as in the station bake) */
export const BASE_EXTENSION_VOXELS = 3;
const PADDING_VOXELS = 2;

export type AreaGrid = {
  /** grid over the whole area (all tiles) */
  readonly spec: GridSpec;
  readonly tileBricks: number;
  readonly tilesX: number;
  readonly tilesY: number;
  /** brick-table entries per tile (tileBricks² × dims z) */
  readonly tileEntries: number;
  /** z of the extruded building bases */
  readonly baseZ: number;
};

export const areaGrid = (m: Pick<AreaManifest, 'voxelSize' | 'tileSize' | 'grid' | 'tiles'>): AreaGrid => {
  const v = m.voxelSize;
  const brickWorld = v * BRICK_CELLS;
  const tileBricks = m.tileSize / brickWorld;
  if (!Number.isInteger(tileBricks)) throw new Error(`tile size ${m.tileSize} is not a multiple of the brick size ${brickWorld}`);
  const baseZ = -BASE_EXTENSION_VOXELS * v;
  const zOrigin = baseZ - PADDING_VOXELS * v;
  const maxZ = m.tiles.reduce((z, t) => Math.max(z, t.maxZ), 0);
  const zBricks = Math.max(1, Math.ceil((maxZ + PADDING_VOXELS * v - zOrigin) / brickWorld));
  const spec: GridSpec = {
    origin: [m.grid.originX, m.grid.originY, zOrigin],
    voxelSize: v,
    brickCells: BRICK_CELLS,
    brickWorld,
    dims: [m.grid.nx * tileBricks, m.grid.ny * tileBricks, zBricks],
    truncation: TRUNCATION_VOXELS * v,
    occupancyMargin: v,
  };
  return { spec, tileBricks, tilesX: m.grid.nx, tilesY: m.grid.ny, tileEntries: tileBricks * tileBricks * zBricks, baseZ };
};

/** The bake grid of one tile: the tile's square of the area grid, full z range. */
export const tileGridSpec = (g: AreaGrid, ix: number, iy: number): GridSpec => {
  const tileWorld = g.tileBricks * g.spec.brickWorld;
  const origin: Vec3 = [g.spec.origin[0] + ix * tileWorld, g.spec.origin[1] + iy * tileWorld, g.spec.origin[2]];
  return { ...g.spec, origin, dims: [g.tileBricks, g.tileBricks, g.spec.dims[2]] };
};

export const tileTableIndex = (g: Pick<AreaGrid, 'tilesX'>, ix: number, iy: number): number => iy * g.tilesX + ix;

/** Brick table of a tile with its (tile-local) slot indices moved to the atlas range starting at slotBase. */
export const rebaseBrickTable = (table: Uint32Array, slotBase: number): Uint32Array =>
  table.map((e) => {
    if ((e & BRICK_EMPTY_FLAG) !== 0) return e;
    if ((e & 0x40000000) !== 0) throw new Error('refined bricks are not supported in tiled scenes');
    return e + slotBase;
  });

/**
 * Palette table layout on the GPU: [one offset per atlas slot | palette pool]. The offsets of a
 * tile's slots point (absolutely) into its pool range, so the shader keeps reading
 * `slotPalettes[slotPalettes[slot] + index]` as in the single-grid scene.
 */
export const tilePaletteOffsets = (paletteOffsets: Uint32Array, slotCapacity: number, poolStart: number): Uint32Array => {
  const n = paletteOffsets.length - 1;
  const out = new Uint32Array(Math.max(0, n));
  for (let s = 0; s < n; s++) out[s] = slotCapacity + poolStart + paletteOffsets[s];
  return out;
};

/** struct TilingParams (16 bytes), see sdfTiledScene.wgsl */
export const packTilingParams = (g: AreaGrid): Uint32Array =>
  Uint32Array.of(g.tileBricks, g.tilesX, g.tilesY, g.tileEntries);
