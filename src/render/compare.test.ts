import { describe, expect, it } from 'vitest';
import { compareIdImages, interiorMismatches } from './compare';

describe('compareIdImages', () => {
  it('counts mismatches and coverage', () => {
    const d = compareIdImages(Uint32Array.from([0, 1, 1, 2]), Uint32Array.from([0, 1, 2, 0]));
    expect(d).toEqual({ mismatchFraction: 0.5, coverageA: 0.75, coverageB: 0.5, mismatched: 2 });
  });
  it('rejects different sizes', () => {
    expect(() => compareIdImages(new Uint32Array(2), new Uint32Array(3))).toThrow();
  });
});

describe('interiorMismatches', () => {
  it('ignores mismatches on edges of regions and counts interior ones', () => {
    // 4x4 image filled with id 1; the centre pixels differ in b
    const a = new Uint32Array(16).fill(1);
    const b = a.slice();
    b[5] = 0; // interior pixel of a (all neighbours are 1)
    expect(interiorMismatches(a, b, 4)).toBe(1);
    const a2 = a.slice();
    a2[4] = 2; // left neighbour differs -> pixel 5 sits on an edge
    expect(interiorMismatches(a2, b, 4)).toBe(0);
  });
});
