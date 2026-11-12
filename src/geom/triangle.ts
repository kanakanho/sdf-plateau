/** Triangle queries used as CPU references for the WGSL implementations. */
import { type V3, add, cross, dot, length, scale, sub } from './vec3';

/** Closest point on triangle abc to p (Ericson, Real-Time Collision Detection 5.1.5). */
export const closestPointOnTriangle = (p: V3, a: V3, b: V3, c: V3): V3 => {
  const ab = sub(b, a);
  const ac = sub(c, a);
  const ap = sub(p, a);
  const d1 = dot(ab, ap);
  const d2 = dot(ac, ap);
  if (d1 <= 0 && d2 <= 0) return a;
  const bp = sub(p, b);
  const d3 = dot(ab, bp);
  const d4 = dot(ac, bp);
  if (d3 >= 0 && d4 <= d3) return b;
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) return add(a, scale(ab, d1 / (d1 - d3)));
  const cp = sub(p, c);
  const d5 = dot(ab, cp);
  const d6 = dot(ac, cp);
  if (d6 >= 0 && d5 <= d6) return c;
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) return add(a, scale(ac, d2 / (d2 - d6)));
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) {
    return add(b, scale(sub(c, b), (d4 - d3) / (d4 - d3 + (d5 - d6))));
  }
  const denom = 1 / (va + vb + vc);
  return add(a, add(scale(ab, vb * denom), scale(ac, vc * denom)));
};

export const pointTriangleDistance = (p: V3, a: V3, b: V3, c: V3): number =>
  length(sub(p, closestPointOnTriangle(p, a, b, c)));

/**
 * Signed solid angle subtended by triangle abc at p (Van Oosterom & Strackee).
 * Sum over a closed, outward-oriented mesh = 4π inside, 0 outside.
 */
export const triangleSolidAngle = (p: V3, a: V3, b: V3, c: V3): number => {
  const ra = sub(a, p);
  const rb = sub(b, p);
  const rc = sub(c, p);
  const la = length(ra);
  const lb = length(rb);
  const lc = length(rc);
  const num = dot(ra, cross(rb, rc));
  const den = la * lb * lc + dot(ra, rb) * lc + dot(rb, rc) * la + dot(rc, ra) * lb;
  return 2 * Math.atan2(num, den);
};

/** Generalized winding number of a triangle soup (flat array, 9 floats per triangle). */
export const windingNumber = (p: V3, positions: ArrayLike<number>): number => {
  let sum = 0;
  for (let i = 0; i + 8 < positions.length; i += 9) {
    sum += triangleSolidAngle(
      p,
      [positions[i], positions[i + 1], positions[i + 2]],
      [positions[i + 3], positions[i + 4], positions[i + 5]],
      [positions[i + 6], positions[i + 7], positions[i + 8]],
    );
  }
  return sum / (4 * Math.PI);
};

export const triangleNormal = (a: V3, b: V3, c: V3): V3 => {
  const n = cross(sub(b, a), sub(c, a));
  const l = length(n);
  return l > 0 ? scale(n, 1 / l) : [0, 0, 0];
};

export const triangleArea = (a: V3, b: V3, c: V3): number => 0.5 * length(cross(sub(b, a), sub(c, a)));
