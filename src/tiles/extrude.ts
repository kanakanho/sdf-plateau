/**
 * LOD1 prisms (footprint rings + height) -> closed, outward-facing triangle meshes for the bake.
 * Walls and the roof are classified directly; the bottom sits at `baseZ` (below the ground) so
 * the baked walls meet the ground plane crisply.
 */
import { SurfaceType, packTriInfo } from '../data/meshFormat';
import { type TileBuildings, isHoleRing, ringVertexCount, tileRingOffsets } from '../data/tileFormat';
import { triangulatePolygon } from '../geom/polygon';
import type { V3 } from '../geom/vec3';

type Ring2 = [number, number][];

/** Twice the signed area (positive = counter-clockwise seen from above). */
export const signedArea2 = (ring: readonly (readonly [number, number])[]): number => {
  let s = 0;
  for (let i = 0; i < ring.length; i++) {
    const [x0, y0] = ring[i];
    const [x1, y1] = ring[(i + 1) % ring.length];
    s += x0 * y1 - x1 * y0;
  }
  return s;
};

/** Exterior rings counter-clockwise, holes clockwise (so every wall faces out of the solid). */
export const orientRing = (ring: Ring2, hole: boolean): Ring2 => {
  const ccw = signedArea2(ring) > 0;
  return ccw === hole ? [...ring].reverse() : ring;
};

const pushTri = (out: number[], a: V3, b: V3, c: V3) => out.push(...a, ...b, ...c);

/** Wall quads (two triangles each) along a ring, from z0 to z1. */
export const wallTriangles = (ring: Ring2, z0: number, z1: number): number[] => {
  const out: number[] = [];
  for (let i = 0; i < ring.length; i++) {
    const [ax, ay] = ring[i];
    const [bx, by] = ring[(i + 1) % ring.length];
    if (ax === bx && ay === by) continue;
    pushTri(out, [ax, ay, z0], [bx, by, z0], [bx, by, z1]);
    pushTri(out, [ax, ay, z0], [bx, by, z1], [ax, ay, z1]);
  }
  return out;
};

/** Horizontal cap at z with the requested facing (+1 up, -1 down). */
export const capTriangles = (exterior: Ring2, holes: readonly Ring2[], z: number, facing: 1 | -1): number[] => {
  const lift = (r: Ring2): V3[] => r.map(([x, y]) => [x, y, z]);
  const out: number[] = [];
  for (const [a, b, c] of triangulatePolygon(lift(exterior), holes.map(lift))) {
    const nz = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    if (nz === 0) continue;
    if (Math.sign(nz) === facing) pushTri(out, a, b, c);
    else pushTri(out, a, c, b);
  }
  return out;
};

export type ExtrudedMesh = { readonly positions: Float32Array; readonly triInfo: Uint32Array };

/** Extrudes every building of a tile; triInfo carries the area-wide building index. */
export const extrudeTile = (tile: TileBuildings, baseZ: number): ExtrudedMesh => {
  const { ringStart, vertexStart } = tileRingOffsets(tile.ringCounts, tile.rings);
  const positions: number[] = [];
  const info: number[] = [];
  const emit = (tris: number[], building: number, type: number) => {
    for (let k = 0; k < tris.length; k += 9) info.push(packTriInfo(building, type));
    for (const v of tris) positions.push(v);
  };
  for (let b = 0; b < tile.indices.length; b++) {
    const top = tile.heights[b];
    let exterior: Ring2 | null = null;
    const holes: Ring2[] = [];
    const flush = () => {
      if (!exterior) return;
      const building = tile.indices[b];
      emit(capTriangles(exterior, holes, top, 1), building, SurfaceType.Roof);
      emit(capTriangles(exterior, holes, baseZ, -1), building, SurfaceType.Ground);
      exterior = null;
      holes.length = 0;
    };
    for (let r = ringStart[b]; r < ringStart[b + 1]; r++) {
      const hole = isHoleRing(tile.rings[r]);
      const ring: Ring2 = [];
      for (let k = vertexStart[r]; k < vertexStart[r] + ringVertexCount(tile.rings[r]); k++) {
        ring.push([tile.positions[k * 2], tile.positions[k * 2 + 1]]);
      }
      if (ring.length < 3) continue;
      if (!hole) flush();
      const oriented = orientRing(ring, hole);
      emit(wallTriangles(oriented, baseZ, top), tile.indices[b], SurfaceType.Wall);
      if (hole) holes.push(oriented);
      else exterior = oriented;
    }
    flush();
  }
  return { positions: Float32Array.from(positions), triInfo: Uint32Array.from(info) };
};
