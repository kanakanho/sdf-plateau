/**
 * Long-lived GPU resources of a streamed (tiled) area, plus the bindings matching
 * sdfTiledScene.wgsl. Tiles are written into fixed pools (atlas rows, brick-table blocks, palette
 * ranges) and published by pointing their tileTable entry at their resident index.
 */
import { type AtlasLayout, computeAtlasLayout, SAMPLES_PER_BRICK } from '../bake/atlasLayout';
import { type BakedAtlas, bakeIntoAtlas, createAtlasTexture } from '../bake/bakeGpu';
import type { BrickBins } from '../bake/binning';
import type { GridSpec } from '../bake/gridSpec';
import type { SlotPalettes } from '../bake/palette';
import { packSceneParams } from '../bake/params';
import type { DeclaredBinding } from '../gpu/bindings';
import { createBufferFromData } from '../gpu/buffers';
import { type AreaGrid, packTilingParams, rebaseBrickTable, tilePaletteOffsets } from '../tiles/tileGrid';

export const TILE_NOT_RESIDENT = 0xffffffff;
/** distance (r8unorm) + id (r8uint) bytes per atlas slot */
export const BYTES_PER_SLOT = SAMPLES_PER_BRICK * 2;

export type TiledBudget = {
  /** GPU memory for the two atlases [bytes] */
  readonly atlasBytes: number;
  /** maximum number of tiles resident at once */
  readonly residentTiles: number;
  /** palette pool entries (default: PALETTE_ENTRIES_PER_SLOT per atlas slot) */
  readonly paletteEntries?: number;
};

/** dense LOD1 city tiles use about 15 palette entries per slot (distinct building/surface ids near a brick) */
export const PALETTE_ENTRIES_PER_SLOT = 16;

/** 384 MiB of atlases hold about 30 dense city tiles at 2 m voxels (about 8,000 slots each) */
export const DEFAULT_TILED_BUDGET: TiledBudget = { atlasBytes: 384 * 1024 * 1024, residentTiles: 64 };

/** Atlas layout for a memory budget (whole slot rows; capacity is the real slot count of the layout). */
export const budgetAtlasLayout = (atlasBytes: number): { layout: AtlasLayout; slotCapacity: number } => {
  const layout = computeAtlasLayout(Math.max(1, Math.floor(atlasBytes / BYTES_PER_SLOT)));
  return { layout, slotCapacity: layout.slotsX * layout.slotsY * layout.slotsZ };
};

export type TiledSceneResources = {
  readonly params: GPUBuffer;
  readonly tiling: GPUBuffer;
  readonly tileTable: GPUBuffer;
  readonly brickTable: GPUBuffer;
  readonly slotPalettes: GPUBuffer;
  readonly atlas: BakedAtlas;
  readonly atlasView: GPUTextureView;
  readonly idAtlasView: GPUTextureView;
  readonly sampler: GPUSampler;
  readonly grid: AreaGrid;
  readonly layout: AtlasLayout;
  readonly slotCapacity: number;
  readonly residentCapacity: number;
  readonly paletteCapacity: number;
};

export const createTiledSceneResources = (
  device: GPUDevice,
  grid: AreaGrid,
  budget: TiledBudget = DEFAULT_TILED_BUDGET,
): TiledSceneResources => {
  const { layout, slotCapacity } = budgetAtlasLayout(budget.atlasBytes);
  const paletteEntries = budget.paletteEntries ?? slotCapacity * PALETTE_ENTRIES_PER_SLOT;
  const S = GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST;
  const U = GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST;
  const atlas: BakedAtlas = { distance: createAtlasTexture(device, layout), id: createAtlasTexture(device, layout, 'r8uint') };
  const buffer = (label: string, size: number, usage: number) => device.createBuffer({ label, size: Math.max(16, size), usage });
  return {
    params: createBufferFromData(device, new Uint8Array(packSceneParams(grid.spec, layout, 1, slotCapacity)), U, 'tiled-scene-params'),
    tiling: createBufferFromData(device, packTilingParams(grid), U, 'tiling-params'),
    tileTable: createBufferFromData(device, new Uint32Array(grid.tilesX * grid.tilesY).fill(TILE_NOT_RESIDENT), S, 'tile-table'),
    brickTable: buffer('tile-brick-pool', budget.residentTiles * grid.tileEntries * 4, S),
    slotPalettes: buffer('tile-palette-pool', (slotCapacity + paletteEntries) * 4, S),
    atlas,
    atlasView: atlas.distance.createView({ dimension: '3d' }),
    idAtlasView: atlas.id.createView({ dimension: '3d' }),
    sampler: device.createSampler({ magFilter: 'linear', minFilter: 'linear', addressModeU: 'clamp-to-edge', addressModeV: 'clamp-to-edge', addressModeW: 'clamp-to-edge' }),
    grid,
    layout,
    slotCapacity,
    residentCapacity: budget.residentTiles,
    paletteCapacity: paletteEntries,
  };
};

/** Bindings for sdfTiledScene.wgsl (+ sdfSceneCommon.wgsl) starting at `first` (8 consecutive slots). */
export const tiledSceneBindings = (r: TiledSceneResources, first: number): DeclaredBinding[] => [
  { binding: first, decl: 'var<uniform> scene: SceneParams;', resource: { buffer: r.params } },
  { binding: first + 1, decl: 'var<uniform> tiling: TilingParams;', resource: { buffer: r.tiling } },
  { binding: first + 2, decl: 'var<storage, read> tileTable: array<u32>;', resource: { buffer: r.tileTable } },
  { binding: first + 3, decl: 'var<storage, read> brickTable: array<u32>;', resource: { buffer: r.brickTable } },
  { binding: first + 4, decl: 'var sdfAtlas: texture_3d<f32>;', resource: r.atlasView },
  { binding: first + 5, decl: 'var sdfSampler: sampler;', resource: r.sampler },
  { binding: first + 6, decl: 'var idAtlas: texture_3d<u32>;', resource: r.idAtlasView },
  { binding: first + 7, decl: 'var<storage, read> slotPalettes: array<u32>;', resource: { buffer: r.slotPalettes } },
];

export const destroyTiledSceneResources = (r: TiledSceneResources): void => {
  for (const b of [r.params, r.tiling, r.tileTable, r.brickTable, r.slotPalettes]) b.destroy();
  r.atlas.distance.destroy();
  r.atlas.id.destroy();
};

/** Where a resident tile lives in the shared pools. */
export type TilePlacement = {
  /** index into the brick-table pool (blocks of grid.tileEntries) */
  readonly resident: number;
  /** first atlas slot (a multiple of the atlas row width) */
  readonly slotBase: number;
  /** first entry of the palette pool */
  readonly paletteStart: number;
};

export type TileTables = {
  /** tile-local brick table (slots from 0) */
  readonly brickTable: Uint32Array;
  /** CSR palette offsets (slotCount + 1) and entries, see buildSlotPalettes */
  readonly paletteOffsets: Uint32Array;
  readonly palette: Uint32Array;
};

/** Writes a baked tile's brick table and palettes into the pools (does not publish it yet). */
export const writeTileTables = (
  device: GPUDevice,
  r: TiledSceneResources,
  place: TilePlacement,
  tables: TileTables,
): void => {
  if (tables.brickTable.length !== r.grid.tileEntries) throw new Error('tile brick table does not match the area grid');
  device.queue.writeBuffer(r.brickTable, place.resident * r.grid.tileEntries * 4, rebaseBrickTable(tables.brickTable, place.slotBase));
  const slotOffsets = tilePaletteOffsets(tables.paletteOffsets, r.slotCapacity, place.paletteStart);
  if (slotOffsets.length) device.queue.writeBuffer(r.slotPalettes, place.slotBase * 4, slotOffsets);
  if (tables.palette.length) device.queue.writeBuffer(r.slotPalettes, (r.slotCapacity + place.paletteStart) * 4, tables.palette);
};

/** Points a tile's tileTable entry at its resident block, or clears it. */
export const setTileEntry = (device: GPUDevice, r: TiledSceneResources, tableIndex: number, resident: number): void => {
  device.queue.writeBuffer(r.tileTable, tableIndex * 4, Uint32Array.of(resident >>> 0));
};

/** What a tile bake needs (the CPU half runs in the tile worker, see prepareBakeOnGrid). */
export type PreparedTile = {
  readonly positions: Float32Array;
  readonly bins: BrickBins;
  readonly slotDescs: Float32Array;
  readonly spec: GridSpec;
  readonly brickTable: Uint32Array;
  readonly palettes: SlotPalettes;
};

/** Bakes a prepared tile into its atlas rows and writes its tables. Publish it with setTileEntry afterwards. */
export const bakeTileInto = async (device: GPUDevice, r: TiledSceneResources, place: TilePlacement, t: PreparedTile): Promise<void> => {
  await bakeIntoAtlas(
    device,
    r.atlas,
    { positions: t.positions, bins: t.bins, triPaletteIndex: t.palettes.triPaletteIndex, slotDescs: t.slotDescs, spec: t.spec, layout: r.layout },
    place.slotBase,
  );
  writeTileTables(device, r, place, { brickTable: t.brickTable, paletteOffsets: t.palettes.paletteOffsets, palette: t.palettes.palette });
};
