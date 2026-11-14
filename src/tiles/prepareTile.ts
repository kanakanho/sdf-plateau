/** CPU half of a tile load (runs in the tile worker): decode, extrude, bin, palettes. */
import type { GridSpec } from '../bake/gridSpec';
import { prepareBakeOnGrid } from '../bake/prepare';
import { decodeTile } from '../data/tileFormat';
import type { PreparedTile } from '../render/tiledScene';
import { extrudeTile } from './extrude';

export type PreparedTileData = PreparedTile & {
  /** area-wide indices and GPU attributes (vec4) of every building drawn by the tile */
  readonly indices: Uint32Array;
  readonly attributes: Float32Array;
  readonly triCount: number;
};

export const prepareTile = (buf: ArrayBuffer, spec: GridSpec, baseZ: number): PreparedTileData => {
  const tile = decodeTile(buf);
  const mesh = extrudeTile(tile, baseZ);
  const p = prepareBakeOnGrid(mesh.positions, mesh.triInfo, spec, { refineFactor: 1 });
  return {
    positions: mesh.positions,
    bins: p.bins,
    slotDescs: p.slotDescs,
    spec,
    brickTable: p.brickTable,
    palettes: p.palettes,
    indices: tile.indices.slice(),
    attributes: tile.attributes.slice(),
    triCount: mesh.triInfo.length,
  };
};

/** ArrayBuffers that can be transferred out of the worker. */
export const preparedTileTransferables = (t: PreparedTileData): ArrayBuffer[] =>
  [
    t.positions, t.bins.slotBricks, t.bins.triOffsets, t.bins.triIndices, t.slotDescs, t.brickTable,
    t.palettes.triPaletteIndex, t.palettes.paletteOffsets, t.palettes.palette, t.indices, t.attributes,
  ].map((a) => a.buffer as ArrayBuffer);
