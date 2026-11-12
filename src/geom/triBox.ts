/**
 * Triangle / axis-aligned box overlap test (Akenine-Möller separating axis theorem).
 * Written with scalar arithmetic (no temporary arrays) because binning calls it millions of times.
 */
import type { V3 } from './vec3';

/** Does the projection of the triangle onto axis (ax, ay, az) overlap the box's projection? */
const axisOverlaps = (
  ax: number, ay: number, az: number,
  x0: number, y0: number, z0: number,
  x1: number, y1: number, z1: number,
  x2: number, y2: number, z2: number,
  hx: number, hy: number, hz: number,
): boolean => {
  if (ax === 0 && ay === 0 && az === 0) return true; // degenerate axis cannot separate
  const p0 = ax * x0 + ay * y0 + az * z0;
  const p1 = ax * x1 + ay * y1 + az * z1;
  const p2 = ax * x2 + ay * y2 + az * z2;
  const r = hx * Math.abs(ax) + hy * Math.abs(ay) + hz * Math.abs(az);
  return !(Math.min(p0, p1, p2) > r || Math.max(p0, p1, p2) < -r);
};

export const triBoxOverlap = (center: V3, half: V3, a: V3, b: V3, c: V3): boolean => {
  const [hx, hy, hz] = half;
  const x0 = a[0] - center[0], y0 = a[1] - center[1], z0 = a[2] - center[2];
  const x1 = b[0] - center[0], y1 = b[1] - center[1], z1 = b[2] - center[2];
  const x2 = c[0] - center[0], y2 = c[1] - center[1], z2 = c[2] - center[2];
  // box face normals
  if (Math.min(x0, x1, x2) > hx || Math.max(x0, x1, x2) < -hx) return false;
  if (Math.min(y0, y1, y2) > hy || Math.max(y0, y1, y2) < -hy) return false;
  if (Math.min(z0, z1, z2) > hz || Math.max(z0, z1, z2) < -hz) return false;
  // edges
  const e0x = x1 - x0, e0y = y1 - y0, e0z = z1 - z0;
  const e1x = x2 - x1, e1y = y2 - y1, e1z = z2 - z1;
  const e2x = x0 - x2, e2y = y0 - y2, e2z = z0 - z2;
  // triangle normal
  const nx = e0y * e1z - e0z * e1y;
  const ny = e0z * e1x - e0x * e1z;
  const nz = e0x * e1y - e0y * e1x;
  const P = [x0, y0, z0, x1, y1, z1, x2, y2, z2, hx, hy, hz] as const;
  if (!axisOverlaps(nx, ny, nz, ...P)) return false;
  // 9 cross-product axes: X × e = (0, -ez, ey), Y × e = (ez, 0, -ex), Z × e = (-ey, ex, 0)
  return (
    axisOverlaps(0, -e0z, e0y, ...P) && axisOverlaps(e0z, 0, -e0x, ...P) && axisOverlaps(-e0y, e0x, 0, ...P) &&
    axisOverlaps(0, -e1z, e1y, ...P) && axisOverlaps(e1z, 0, -e1x, ...P) && axisOverlaps(-e1y, e1x, 0, ...P) &&
    axisOverlaps(0, -e2z, e2y, ...P) && axisOverlaps(e2z, 0, -e2x, ...P) && axisOverlaps(-e2y, e2x, 0, ...P)
  );
};
