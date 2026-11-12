import { describe, expect, it } from 'vitest';
import { add, clamp, cross, dot, length, normalize, scale, sub } from './vec3';

describe('vec3', () => {
  it('add / sub', () => {
    expect(add([1, 2, 3], [4, 5, 6])).toEqual([5, 7, 9]);
    expect(sub([1, 2, 3], [4, 5, 6])).toEqual([-3, -3, -3]);
  });
  it('scale', () => {
    expect(scale([1, -2, 3], 2)).toEqual([2, -4, 6]);
  });
  it('dot', () => {
    expect(dot([1, 2, 3], [4, 5, 6])).toBe(32);
  });
  it('cross follows the right-hand rule', () => {
    expect(cross([1, 0, 0], [0, 1, 0])).toEqual([0, 0, 1]);
  });
  it('length', () => {
    expect(length([3, 4, 12])).toBe(13);
  });
  it('normalize', () => {
    expect(normalize([0, 0, 5])).toEqual([0, 0, 1]);
    expect(normalize([0, 0, 0])).toEqual([0, 0, 0]);
  });
  it('clamp', () => {
    expect(clamp(5, 0, 1)).toBe(1);
    expect(clamp(-5, 0, 1)).toBe(0);
    expect(clamp(0.5, 0, 1)).toBe(0.5);
  });
});
