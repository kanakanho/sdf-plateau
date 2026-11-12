/** Planar 3D polygon triangulation (Newell normal + earcut on the projected plane). */
import earcut from 'earcut';
import { type V3, cross, dot, length, normalize, scale, sub } from './vec3';

export type Ring3 = readonly V3[];

/** Removes a duplicated closing vertex (GML rings repeat the first point at the end). */
export const openRing = (ring: Ring3): Ring3 => {
  if (ring.length < 2) return ring;
  const a = ring[0];
  const b = ring[ring.length - 1];
  return a[0] === b[0] && a[1] === b[1] && a[2] === b[2] ? ring.slice(0, -1) : ring;
};

/** Newell's method: robust (non-normalized) polygon normal; its length is 2x the area. */
export const newellNormal = (ring: Ring3): V3 => {
  let x = 0;
  let y = 0;
  let z = 0;
  for (let i = 0; i < ring.length; i++) {
    const c = ring[i];
    const n = ring[(i + 1) % ring.length];
    x += (c[1] - n[1]) * (c[2] + n[2]);
    y += (c[2] - n[2]) * (c[0] + n[0]);
    z += (c[0] - n[0]) * (c[1] + n[1]);
  }
  return [x, y, z];
};

/** Orthonormal basis (u, v) spanning the plane with normal n, such that u × v = n. */
export const planeBasis = (n: V3): [V3, V3] => {
  const nn = normalize(n);
  const helper: V3 = Math.abs(nn[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
  const u = normalize(cross(helper, nn));
  const v = cross(nn, u);
  return [u, v];
};

export const projectRing = (ring: Ring3, origin: V3, u: V3, v: V3): number[] => {
  const out: number[] = [];
  for (const p of ring) {
    const d = sub(p, origin);
    out.push(dot(d, u), dot(d, v));
  }
  return out;
};

/**
 * Triangulates a planar polygon with holes. Returns triangles as vertex triples whose winding
 * matches the exterior ring orientation (so outward-oriented GML surfaces stay outward).
 */
export const triangulatePolygon = (exterior: Ring3, interiors: readonly Ring3[] = []): V3[][] => {
  const ext = openRing(exterior);
  if (ext.length < 3) return [];
  const n = newellNormal(ext);
  if (length(n) < 1e-12) return [];
  const holes = interiors.map(openRing).filter((r) => r.length >= 3);
  const all: V3[] = [...ext, ...holes.flat()];
  const [u, v] = planeBasis(n);
  const flat = projectRing(all, ext[0], u, v);
  const holeIndices: number[] = [];
  let offset = ext.length;
  for (const h of holes) {
    holeIndices.push(offset);
    offset += h.length;
  }
  const idx = earcut(flat, holeIndices, 2);
  const tris: V3[][] = [];
  for (let i = 0; i < idx.length; i += 3) {
    const a = all[idx[i]];
    const b = all[idx[i + 1]];
    const c = all[idx[i + 2]];
    // make every triangle agree with the polygon normal
    const tn = cross(sub(b, a), sub(c, a));
    tris.push(dot(tn, n) >= 0 ? [a, b, c] : [a, c, b]);
  }
  return tris;
};

/** Polygon area from the Newell normal. */
export const polygonArea = (ring: Ring3): number => length(scale(newellNormal(openRing(ring)), 0.5));
