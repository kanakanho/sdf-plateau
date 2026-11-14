/** Chooses which tiles of an area to keep resident for the current view (pure). */
import type { AreaManifest } from '../data/area';
import type { ViewFootprint, Xy } from './footprint';

/** Separating-axis test between a convex polygon (CCW) and an axis-aligned rectangle. */
export const convexOverlapsRect = (poly: readonly Xy[], minX: number, minY: number, maxX: number, maxY: number): boolean => {
  if (!poly.length) return false;
  if (Math.max(...poly.map((p) => p[0])) < minX || Math.min(...poly.map((p) => p[0])) > maxX) return false;
  if (Math.max(...poly.map((p) => p[1])) < minY || Math.min(...poly.map((p) => p[1])) > maxY) return false;
  const corners: Xy[] = [[minX, minY], [maxX, minY], [maxX, maxY], [minX, maxY]];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const nx = b[1] - a[1];
    const ny = a[0] - b[0];
    // outward normal of a CCW edge; the rectangle is outside if all its corners are beyond the edge
    if (corners.every((c) => (c[0] - a[0]) * nx + (c[1] - a[1]) * ny > 0)) return false;
  }
  return true;
};

export type TileKey = number;
export const tileKey = (m: Pick<AreaManifest, 'grid'>, ix: number, iy: number): TileKey => iy * m.grid.nx + ix;

/**
 * Non-empty tiles overlapping the footprint, nearest to the camera first (distance to the tile
 * square), at most `maxTiles`.
 */
export const selectTiles = (
  m: Pick<AreaManifest, 'grid' | 'tileSize' | 'tiles'>,
  view: ViewFootprint,
  maxTiles: number,
): TileKey[] => {
  const [cx, cy] = view.camera;
  const scored: { key: TileKey; d: number }[] = [];
  for (const t of m.tiles) {
    const x0 = m.grid.originX + t.ix * m.tileSize;
    const y0 = m.grid.originY + t.iy * m.tileSize;
    if (!convexOverlapsRect(view.polygon, x0, y0, x0 + m.tileSize, y0 + m.tileSize)) continue;
    const dx = Math.max(x0 - cx, 0, cx - (x0 + m.tileSize));
    const dy = Math.max(y0 - cy, 0, cy - (y0 + m.tileSize));
    scored.push({ key: tileKey(m, t.ix, t.iy), d: Math.hypot(dx, dy) });
  }
  return scored.sort((a, b) => a.d - b.d || a.key - b.key).slice(0, maxTiles).map((s) => s.key);
};

/**
 * Groups per-building vec4 attributes by runs of consecutive area-wide indices, so a tile's
 * buildings can be written into the area-wide attribute buffer with a few writes.
 */
export const attributeRuns = (indices: ArrayLike<number>, attributes: Float32Array): { start: number; data: Float32Array }[] => {
  const order = Array.from({ length: indices.length }, (_, i) => i).sort((a, b) => indices[a] - indices[b]);
  const runs: { start: number; items: number[] }[] = [];
  for (const i of order) {
    const v = indices[i];
    const last = runs[runs.length - 1];
    if (last && v < last.start + last.items.length) continue; // duplicate index
    if (last && v === last.start + last.items.length) last.items.push(i);
    else runs.push({ start: v, items: [i] });
  }
  return runs.map((r) => {
    const data = new Float32Array(r.items.length * 4);
    r.items.forEach((i, k) => data.set(attributes.subarray(i * 4, i * 4 + 4), k * 4));
    return { start: r.start, data };
  });
};
