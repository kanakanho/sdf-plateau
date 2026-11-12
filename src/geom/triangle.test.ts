import { describe, expect, it } from 'vitest';
import { boxTriangles } from './boxMesh';
import {
  closestPointOnTriangle,
  pointTriangleDistance,
  triangleArea,
  triangleNormal,
  triangleSolidAngle,
  windingNumber,
} from './triangle';
import type { V3 } from './vec3';

const A: V3 = [0, 0, 0];
const B: V3 = [1, 0, 0];
const C: V3 = [0, 1, 0];

describe('closestPointOnTriangle', () => {
  it('projects interior points onto the face', () => {
    const p = closestPointOnTriangle([0.2, 0.2, 5], A, B, C);
    expect(p[0]).toBeCloseTo(0.2, 12);
    expect(p[1]).toBeCloseTo(0.2, 12);
    expect(p[2]).toBeCloseTo(0, 12);
  });
  it('snaps to vertices', () => {
    expect(closestPointOnTriangle([-1, -1, 0], A, B, C)).toEqual(A);
    expect(closestPointOnTriangle([2, -0.5, 0], A, B, C)).toEqual(B);
    expect(closestPointOnTriangle([-0.5, 2, 0], A, B, C)).toEqual(C);
  });
  it('snaps to edges', () => {
    expect(closestPointOnTriangle([0.5, -1, 0], A, B, C)).toEqual([0.5, 0, 0]);
    const p = closestPointOnTriangle([1, 1, 0], A, B, C);
    expect(p[0]).toBeCloseTo(0.5, 12);
    expect(p[1]).toBeCloseTo(0.5, 12);
  });
});

describe('pointTriangleDistance', () => {
  it('is the perpendicular distance above the face', () => {
    expect(pointTriangleDistance([0.25, 0.25, -3], A, B, C)).toBeCloseTo(3, 12);
  });
  it('is the vertex distance outside', () => {
    expect(pointTriangleDistance([-3, -4, 0], A, B, C)).toBeCloseTo(5, 12);
  });
});

describe('triangleSolidAngle', () => {
  it('is zero for points in the triangle plane outside it', () => {
    expect(triangleSolidAngle([5, 5, 0], A, B, C)).toBeCloseTo(0, 12);
  });
  it('is positive behind the face (inside for outward normals) and flips sign across the plane', () => {
    const front = triangleSolidAngle([0.2, 0.2, 1], A, B, C);
    const back = triangleSolidAngle([0.2, 0.2, -1], A, B, C);
    expect(back).toBeGreaterThan(0);
    expect(front).toBeCloseTo(-back, 12);
  });
});

describe('windingNumber', () => {
  const box = boxTriangles([0, 0, 0], [2, 2, 2]);
  it('is 1 inside a closed box', () => {
    expect(windingNumber([1, 1, 1], box)).toBeCloseTo(1, 9);
    expect(windingNumber([0.1, 1.9, 0.3], box)).toBeCloseTo(1, 9);
  });
  it('is 0 outside', () => {
    expect(windingNumber([3, 1, 1], box)).toBeCloseTo(0, 9);
    expect(windingNumber([-5, -5, 10], box)).toBeCloseTo(0, 9);
  });
  it('is about 0.5 next to an open box (top removed) near the opening', () => {
    // the top quad is triangles 2 and 3
    const withoutTop = Float32Array.from([...box.slice(0, 18), ...box.slice(36)]);
    const w = windingNumber([1, 1, 1.999], withoutTop);
    expect(w).toBeGreaterThan(0.4);
    expect(w).toBeLessThan(0.6);
  });
});

describe('triangleNormal / triangleArea', () => {
  it('normal follows CCW winding', () => {
    expect(triangleNormal(A, B, C)).toEqual([0, 0, 1]);
    expect(triangleNormal(A, C, B)).toEqual([0, 0, -1]);
  });
  it('degenerate triangles have a zero normal', () => {
    expect(triangleNormal(A, A, B)).toEqual([0, 0, 0]);
  });
  it('area', () => {
    expect(triangleArea(A, B, C)).toBe(0.5);
  });
});

describe('boxTriangles', () => {
  it('produces 12 outward-facing triangles', () => {
    const box = boxTriangles([0, 0, 0], [1, 1, 1]);
    expect(box.length).toBe(12 * 9);
    for (let i = 0; i < 12; i++) {
      const t = box.subarray(i * 9, i * 9 + 9);
      const a: V3 = [t[0], t[1], t[2]];
      const b: V3 = [t[3], t[4], t[5]];
      const c: V3 = [t[6], t[7], t[8]];
      const n = triangleNormal(a, b, c);
      const centroid: V3 = [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3];
      const out = (centroid[0] - 0.5) * n[0] + (centroid[1] - 0.5) * n[1] + (centroid[2] - 0.5) * n[2];
      expect(out).toBeGreaterThan(0);
    }
  });
});

describe('gableTriangles', () => {
  it('is a closed outward-oriented solid', async () => {
    const { gableTriangles } = await import('./boxMesh');
    const g = gableTriangles(0, 0, 10, 8, 5, 9);
    expect(g.length).toBe(16 * 9);
    expect(windingNumber([5, 4, 3], g)).toBeCloseTo(1, 9);
    expect(windingNumber([5, 4, 8.5], g)).toBeCloseTo(1, 9);
    expect(windingNumber([5, 0.5, 8.5], g)).toBeCloseTo(0, 9); // above the slope
    expect(windingNumber([20, 4, 3], g)).toBeCloseTo(0, 9);
  });
});
