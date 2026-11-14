/**
 * Ground footprint of the view: the screen corners cast onto z = 0 in the local frame, cut off at
 * a maximum distance from the camera (corners above the horizon go straight out to that distance).
 */
import { transformVec4 } from '../geo/mat4';

export type Xy = readonly [number, number];
export type ViewFootprint = {
  /** camera position (local meters) */
  readonly camera: readonly [number, number, number];
  /** convex polygon on the ground (counter-clockwise) */
  readonly polygon: readonly Xy[];
};

const unproject = (inv: ArrayLike<number>, x: number, y: number, z: number): [number, number, number] => {
  const [px, py, pz, pw] = transformVec4(inv, [x, y, z, 1]);
  return [px / pw, py / pw, pz / pw];
};

/** Convex hull (Andrew's monotone chain), counter-clockwise, without collinear points. */
export const convexHull = (points: readonly Xy[]): Xy[] => {
  const p = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (p.length < 3) return p;
  const cross = (o: Xy, a: Xy, b: Xy) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const half = (pts: Xy[]) => {
    const h: Xy[] = [];
    for (const q of pts) {
      while (h.length >= 2 && cross(h[h.length - 2], h[h.length - 1], q) <= 0) h.pop();
      h.push(q);
    }
    h.pop();
    return h;
  };
  return [...half(p), ...half([...p].reverse())];
};

/**
 * `invLocalToClip` maps GL clip space (z in [-1, 1]) back to local meters. Samples the screen
 * border (not just the corners) so the cut at maxDistance stays round enough.
 */
export const viewFootprint = (invLocalToClip: ArrayLike<number>, maxDistance: number, samplesPerEdge = 4): ViewFootprint => {
  const camera = unproject(invLocalToClip, 0, 0, -1);
  const pts: Xy[] = [];
  const n = Math.max(1, samplesPerEdge);
  const border: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const s = -1 + (2 * i) / n;
    border.push([s, -1], [1, s], [-s, 1], [-1, -s]);
  }
  for (const [x, y] of border) {
    const near = unproject(invLocalToClip, x, y, -1);
    const far = unproject(invLocalToClip, x, y, 1);
    const d = [far[0] - near[0], far[1] - near[1], far[2] - near[2]];
    const horiz = Math.hypot(d[0], d[1]);
    let gx: number;
    let gy: number;
    if (d[2] < 0 && near[2] > 0) {
      const t = -near[2] / d[2];
      gx = near[0] + d[0] * t;
      gy = near[1] + d[1] * t;
    } else if (horiz > 0) {
      gx = camera[0] + (d[0] / horiz) * maxDistance;
      gy = camera[1] + (d[1] / horiz) * maxDistance;
    } else continue;
    const r = Math.hypot(gx - camera[0], gy - camera[1]);
    if (r > maxDistance) {
      gx = camera[0] + ((gx - camera[0]) / r) * maxDistance;
      gy = camera[1] + ((gy - camera[1]) / r) * maxDistance;
    }
    pts.push([gx, gy]);
  }
  // the ground right below the camera is always relevant (shadows, steep views)
  pts.push([camera[0], camera[1]]);
  return { camera, polygon: convexHull(pts) };
};
