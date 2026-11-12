import { describe, expect, it } from 'vitest';
import { triBoxOverlap } from './triBox';

const C = [0, 0, 0] as const;
const H = [1, 1, 1] as const;

describe('triBoxOverlap', () => {
  it('detects a triangle inside the box', () => {
    expect(triBoxOverlap(C, H, [0, 0, 0], [0.5, 0, 0], [0, 0.5, 0])).toBe(true);
  });
  it('detects a large triangle slicing through the box', () => {
    expect(triBoxOverlap(C, H, [-10, -10, 0], [10, -10, 0], [0, 10, 0])).toBe(true);
  });
  it('rejects a triangle beyond a face', () => {
    expect(triBoxOverlap(C, H, [2, 0, 0], [3, 0, 0], [2, 1, 0])).toBe(false);
  });
  it('rejects by the triangle plane axis', () => {
    // plane x+y+z = 3.2 lies outside the corner (1,1,1) (sum 3)
    expect(triBoxOverlap(C, H, [3.2, 0, 0], [0, 3.2, 0], [0, 0, 3.2])).toBe(false);
    expect(triBoxOverlap(C, H, [2.8, 0, 0], [0, 2.8, 0], [0, 0, 2.8])).toBe(true);
  });
  it('rejects by an edge cross-product axis', () => {
    // in plane z=0 (which cuts the box) but beyond the corner x+y=2; only axis (1,1,0) separates
    expect(triBoxOverlap(C, H, [1.6, 0.5, 0], [0.5, 1.6, 0], [3, 3, 0])).toBe(false);
    expect(triBoxOverlap(C, H, [1.4, 0.5, 0], [0.5, 1.4, 0], [3, 3, 0])).toBe(true);
  });
  it('respects box center offsets', () => {
    expect(triBoxOverlap([10, 0, 0], H, [9.5, 0, 0], [10.5, 0, 0], [10, 0.5, 0])).toBe(true);
    expect(triBoxOverlap([10, 0, 0], H, [0, 0, 0], [0.5, 0, 0], [0, 0.5, 0])).toBe(false);
  });
});
