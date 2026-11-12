import { describe, expect, it } from 'vitest';
import {
  newellNormal,
  openRing,
  planeBasis,
  polygonArea,
  projectRing,
  triangulatePolygon,
} from './polygon';
import { triangleArea, triangleNormal } from './triangle';
import { cross, dot, normalize, type V3 } from './vec3';

const square: V3[] = [
  [0, 0, 0],
  [2, 0, 0],
  [2, 2, 0],
  [0, 2, 0],
  [0, 0, 0],
];

describe('openRing', () => {
  it('drops a duplicated closing vertex', () => {
    expect(openRing(square)).toHaveLength(4);
  });
  it('keeps already-open rings', () => {
    expect(openRing(square.slice(0, 4))).toHaveLength(4);
  });
});

describe('newellNormal', () => {
  it('points +z for a CCW square in the xy plane with length 2*area', () => {
    expect(newellNormal(openRing(square))).toEqual([0, 0, 8]);
  });
  it('flips for clockwise rings', () => {
    expect(newellNormal(openRing(square).slice().reverse())[2]).toBe(-8);
  });
});

describe('planeBasis', () => {
  it('returns an orthonormal right-handed basis', () => {
    for (const n of [[0, 0, 1], [1, 0, 0], [0.3, -0.5, 0.8]] as V3[]) {
      const [u, v] = planeBasis(n);
      expect(dot(u, v)).toBeCloseTo(0, 12);
      expect(dot(u, normalize(n))).toBeCloseTo(0, 12);
      const w = cross(u, v);
      const nn = normalize(n);
      w.forEach((c, i) => expect(c).toBeCloseTo(nn[i], 12));
    }
  });
});

describe('projectRing', () => {
  it('projects points onto (u, v) coordinates', () => {
    expect(projectRing([[3, 4, 9]], [1, 1, 0], [1, 0, 0], [0, 1, 0])).toEqual([2, 3]);
  });
});

describe('triangulatePolygon', () => {
  it('triangulates a square into 2 triangles preserving orientation', () => {
    const tris = triangulatePolygon(square);
    expect(tris).toHaveLength(2);
    for (const [a, b, c] of tris) expect(triangleNormal(a, b, c)[2]).toBeCloseTo(1, 12);
    expect(tris.reduce((s, [a, b, c]) => s + triangleArea(a, b, c), 0)).toBeCloseTo(4, 12);
  });
  it('keeps clockwise orientation for clockwise rings (downward faces)', () => {
    const tris = triangulatePolygon(square.slice().reverse());
    for (const [a, b, c] of tris) expect(triangleNormal(a, b, c)[2]).toBeCloseTo(-1, 12);
  });
  it('handles vertical walls', () => {
    const wall: V3[] = [[0, 0, 0], [5, 0, 0], [5, 0, 3], [0, 0, 3]];
    const tris = triangulatePolygon(wall);
    expect(tris).toHaveLength(2);
    for (const [a, b, c] of tris) expect(triangleNormal(a, b, c)[1]).toBeCloseTo(-1, 12);
  });
  it('subtracts holes', () => {
    const outer: V3[] = [[0, 0, 0], [4, 0, 0], [4, 4, 0], [0, 4, 0]];
    const hole: V3[] = [[1, 1, 0], [1, 3, 0], [3, 3, 0], [3, 1, 0]];
    const tris = triangulatePolygon(outer, [hole]);
    expect(tris.reduce((s, [a, b, c]) => s + triangleArea(a, b, c), 0)).toBeCloseTo(12, 9);
  });
  it('returns nothing for degenerate input', () => {
    expect(triangulatePolygon([[0, 0, 0], [1, 1, 1]])).toEqual([]);
    expect(triangulatePolygon([[0, 0, 0], [1, 0, 0], [2, 0, 0]])).toEqual([]);
  });
});

describe('polygonArea', () => {
  it('computes area of closed rings', () => {
    expect(polygonArea(square)).toBe(4);
  });
});
