import { describe, expect, it } from 'vitest';
import { invert, lookAt, multiply, perspectiveGl } from '../geo/mat4';
import { convexHull, viewFootprint } from './footprint';

const view = (eye: [number, number, number], target: [number, number, number]) =>
  invert(multiply(perspectiveGl(0.8, 1.5, 1, 100000), lookAt(eye, target, [0, 0, 1])))!;

describe('convexHull', () => {
  it('returns the CCW hull without interior or collinear points', () => {
    const h = convexHull([[0, 0], [2, 0], [1, 0], [2, 2], [0, 2], [1, 1]]);
    expect(h).toEqual([[0, 0], [2, 0], [2, 2], [0, 2]]);
  });
});

describe('viewFootprint', () => {
  it('looking straight down covers a rectangle around the camera', () => {
    const f = viewFootprint(view([100, 200, 500], [100, 200.001, 0]), 1e6);
    expect(f.camera.map((v) => Math.round(v))).toEqual([100, 200, 499]);
    const xs = f.polygon.map((p) => p[0]);
    const ys = f.polygon.map((p) => p[1]);
    // half fov 0.4 rad over 500 m -> about 211 m vertically, aspect 1.5 horizontally
    expect(Math.max(...ys) - 200).toBeCloseTo(500 * Math.tan(0.4), -1);
    expect(Math.max(...xs) - 100).toBeCloseTo(1.5 * 500 * Math.tan(0.4), -1);
  });

  it('cuts views reaching the horizon at maxDistance', () => {
    const f = viewFootprint(view([0, 0, 50], [0, 1000, 40]), 2000);
    const r = f.polygon.map((p) => Math.hypot(p[0] - f.camera[0], p[1] - f.camera[1]));
    expect(Math.max(...r)).toBeLessThanOrEqual(2000 + 1e-6);
    expect(Math.max(...r)).toBeGreaterThan(1900);
    // looking north: nothing far behind the camera
    expect(Math.min(...f.polygon.map((p) => p[1]))).toBeGreaterThan(-60);
  });
});
