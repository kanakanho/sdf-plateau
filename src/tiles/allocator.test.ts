import { describe, expect, it } from 'vitest';
import {
  type RangeAllocator,
  type ResidentTile,
  allocRange,
  createAllocator,
  freeRange,
  freeTotal,
  largestFree,
  planEviction,
} from './allocator';

/** Allocates in sequence, failing the test if any request does not fit. */
const allocAll = (a: RangeAllocator, sizes: number[]): { allocator: RangeAllocator; starts: number[] } =>
  sizes.reduce(
    (acc, size) => {
      const r = allocRange(acc.allocator, size);
      if (!r) throw new Error(`could not allocate ${size}`);
      return { allocator: r.allocator, starts: [...acc.starts, r.start] };
    },
    { allocator: a, starts: [] as number[] },
  );

describe('createAllocator', () => {
  it('starts with one free range covering the capacity', () => {
    expect(createAllocator(10)).toEqual({ capacity: 10, free: [{ start: 0, size: 10 }] });
    expect(createAllocator(0).free).toEqual([]);
  });
});

describe('allocRange', () => {
  it('allocates first fit from the lowest address', () => {
    const { allocator, starts } = allocAll(createAllocator(10), [3, 4]);
    expect(starts).toEqual([0, 3]);
    expect(allocator.free).toEqual([{ start: 7, size: 3 }]);
  });
  it('uses the first hole that is large enough', () => {
    let a = allocAll(createAllocator(10), [2, 2, 3, 3]).allocator;
    a = freeRange(a, 0, 2);
    a = freeRange(a, 4, 3);
    expect(allocRange(a, 3)?.start).toBe(4);
    expect(allocRange(a, 1)?.start).toBe(0);
  });
  it('returns null when no hole is large enough and does not mutate', () => {
    const a = allocAll(createAllocator(10), [8]).allocator;
    const before = structuredClone(a);
    expect(allocRange(a, 3)).toBeNull();
    expect(a).toEqual(before);
  });
  it('consumes a hole exactly', () => {
    const r = allocRange(createAllocator(4), 4);
    expect(r?.allocator.free).toEqual([]);
  });
  it('treats zero-size requests as always fitting without consuming space', () => {
    const a = allocAll(createAllocator(2), [2]).allocator;
    expect(allocRange(a, 0)).toEqual({ allocator: a, start: 0 });
  });
});

describe('freeRange', () => {
  it('merges with both neighbours', () => {
    let a = allocAll(createAllocator(9), [3, 3, 3]).allocator;
    a = freeRange(a, 0, 3);
    a = freeRange(a, 6, 3);
    expect(a.free).toEqual([{ start: 0, size: 3 }, { start: 6, size: 3 }]);
    a = freeRange(a, 3, 3);
    expect(a.free).toEqual([{ start: 0, size: 9 }]);
  });
  it('merges with only the previous or only the next range', () => {
    const full = allocAll(createAllocator(9), [3, 3, 3]).allocator;
    expect(freeRange(freeRange(full, 0, 3), 3, 3).free).toEqual([{ start: 0, size: 6 }]);
    expect(freeRange(freeRange(full, 6, 3), 3, 3).free).toEqual([{ start: 3, size: 6 }]);
  });
  it('keeps non-adjacent ranges separate and sorted', () => {
    let a = allocAll(createAllocator(10), [2, 2, 2, 2, 2]).allocator;
    a = freeRange(a, 6, 2);
    a = freeRange(a, 0, 2);
    expect(a.free).toEqual([{ start: 0, size: 2 }, { start: 6, size: 2 }]);
  });
  it('rejects double frees and out-of-range frees', () => {
    const a = allocAll(createAllocator(10), [4]).allocator;
    expect(() => freeRange(a, 5, 2)).toThrow(/overlaps/);
    expect(() => freeRange(a, 2, 3)).toThrow(/overlaps/);
    expect(() => freeRange(a, 8, 4)).toThrow(/outside/);
    expect(() => freeRange(a, -1, 1)).toThrow(/outside/);
  });
  it('ignores zero-size frees', () => {
    const a = createAllocator(4);
    expect(freeRange(a, 0, 0)).toBe(a);
  });
});

describe('largestFree / freeTotal', () => {
  it('report the biggest hole and the sum of holes', () => {
    let a = allocAll(createAllocator(10), [2, 3, 1, 4]).allocator;
    a = freeRange(a, 0, 2);
    a = freeRange(a, 6, 4);
    expect(largestFree(a)).toBe(4);
    expect(freeTotal(a)).toBe(6);
    expect(largestFree(allocAll(createAllocator(3), [3]).allocator)).toBe(0);
  });
});

describe('planEviction', () => {
  // one pool of 10 rows filled by tiles a..e (2 rows each)
  const tiles: ResidentTile<string>[] = ['a', 'b', 'c', 'd', 'e'].map((key, i) => ({
    key,
    lastUsed: [5, 1, 4, 2, 3][i],
    ranges: [{ start: i * 2, size: 2 }],
  }));
  const full = [allocAll(createAllocator(10), [2, 2, 2, 2, 2]).allocator];

  it('evicts nothing when the request already fits', () => {
    const pools = [freeRange(full[0], 4, 2)];
    expect(planEviction(pools, tiles.filter((t) => t.key !== 'c'), new Set(), [2])).toEqual([]);
  });
  it('evicts the least recently used invisible tile', () => {
    expect(planEviction(full, tiles, new Set(), [2])).toEqual(['b']);
  });
  it('never evicts visible tiles', () => {
    expect(planEviction(full, tiles, new Set(['b']), [2])).toEqual(['d']);
  });
  it('evicts until a contiguous range fits, oldest first, and keeps evictions that were not needed', () => {
    // oldest first: b(1) d(2) e(3) c(4); b and d are not adjacent, b+c or c+d or d+e would be.
    // greedy reaches b, d, e (d+e contiguous), then b turns out to be unnecessary
    expect(planEviction(full, tiles, new Set(), [4])).toEqual(['d', 'e']);
  });
  it('returns the evictions oldest first', () => {
    const t = tiles.map((x) => (x.key === 'e' ? { ...x, lastUsed: 0 } : x));
    expect(planEviction(full, t, new Set(), [4])).toEqual(['e', 'd']);
  });
  it('returns null when even evicting every invisible tile is not enough', () => {
    expect(planEviction(full, tiles, new Set(['c']), [6])).toBeNull();
    expect(planEviction(full, tiles, new Set(), [11])).toBeNull();
  });
  it('requires the request to fit in every pool at once', () => {
    // second pool: a, b own 1 unit each, c owns 3, d and e own nothing; capacity 5
    const second = allocAll(createAllocator(5), [1, 1, 3]).allocator;
    const multi = tiles.map((t, i) => ({
      ...t,
      ranges: [t.ranges[0], [{ start: 0, size: 1 }, { start: 1, size: 1 }, { start: 2, size: 3 }, { start: 0, size: 0 }, { start: 0, size: 0 }][i]],
    }));
    // rows alone would evict b; the second pool also needs 2 contiguous units: c alone frees both
    expect(planEviction([full[0], second], multi, new Set(), [2, 2])).toEqual(['c']);
    // with c visible, b and a together free 2 adjacent units in the second pool
    expect(planEviction([full[0], second], multi, new Set(['c']), [2, 2])).toEqual(['b', 'a']);
  });
  it('rejects mismatched pools and sizes', () => {
    expect(() => planEviction(full, tiles, new Set(), [1, 1])).toThrow();
  });
});
