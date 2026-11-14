/**
 * Pure bookkeeping for the shared tile resources: a first-fit range allocator (atlas slot rows,
 * brick-table pool, palette pool) and an LRU planner that picks which resident tiles to evict.
 * All functions return new values; nothing is mutated.
 */

export type Range = { readonly start: number; readonly size: number };

export type RangeAllocator = {
  readonly capacity: number;
  /** free ranges, sorted by start, non-empty, never adjacent (always merged) */
  readonly free: readonly Range[];
};

export const createAllocator = (capacity: number): RangeAllocator => ({
  capacity,
  free: capacity > 0 ? [{ start: 0, size: capacity }] : [],
});

/** First-fit allocation; a zero-size request always succeeds at 0 without consuming space. */
export const allocRange = (a: RangeAllocator, size: number): { allocator: RangeAllocator; start: number } | null => {
  if (size <= 0) return { allocator: a, start: 0 };
  const i = a.free.findIndex((r) => r.size >= size);
  if (i < 0) return null;
  const hole = a.free[i];
  const rest = hole.size === size ? [] : [{ start: hole.start + size, size: hole.size - size }];
  return { allocator: { ...a, free: [...a.free.slice(0, i), ...rest, ...a.free.slice(i + 1)] }, start: hole.start };
};

/** Returns a range to the free list, merging it with adjacent free ranges. Throws on double free. */
export const freeRange = (a: RangeAllocator, start: number, size: number): RangeAllocator => {
  if (size <= 0) return a;
  const end = start + size;
  if (start < 0 || end > a.capacity) throw new Error(`range ${start}+${size} is outside capacity ${a.capacity}`);
  const i = a.free.findIndex((r) => r.start >= start);
  const at = i < 0 ? a.free.length : i;
  const prev = a.free[at - 1];
  const next = a.free[at];
  if ((prev && prev.start + prev.size > start) || (next && next.start < end))
    throw new Error(`range ${start}+${size} overlaps a free range`);
  const mergePrev = prev !== undefined && prev.start + prev.size === start;
  const mergeNext = next !== undefined && next.start === end;
  const merged = {
    start: mergePrev ? prev.start : start,
    size: size + (mergePrev ? prev.size : 0) + (mergeNext ? next.size : 0),
  };
  return {
    ...a,
    free: [...a.free.slice(0, mergePrev ? at - 1 : at), merged, ...a.free.slice(mergeNext ? at + 1 : at)],
  };
};

export const largestFree = (a: RangeAllocator): number => a.free.reduce((m, r) => Math.max(m, r.size), 0);

export const freeTotal = (a: RangeAllocator): number => a.free.reduce((s, r) => s + r.size, 0);

export type ResidentTile<K> = {
  readonly key: K;
  /** monotonically increasing stamp of the last frame the tile was used */
  readonly lastUsed: number;
  /** the tile's range in each pool, index-aligned with the pools passed to planEviction */
  readonly ranges: readonly Range[];
};

const fitsAll = (pools: readonly RangeAllocator[], sizes: readonly number[]): boolean =>
  pools.every((p, i) => allocRange(p, sizes[i]) !== null);

const freeTile = <K>(pools: readonly RangeAllocator[], tile: ResidentTile<K>): RangeAllocator[] =>
  pools.map((p, i) => freeRange(p, tile.ranges[i].start, tile.ranges[i].size));

const freeTiles = <K>(pools: readonly RangeAllocator[], tiles: readonly ResidentTile<K>[]): readonly RangeAllocator[] =>
  tiles.reduce<readonly RangeAllocator[]>(freeTile, pools);

/**
 * Chooses resident tiles to evict so that a request of `sizes[i]` contiguous units fits into every
 * pool `pools[i]` at once. Only tiles that are not visible are candidates; they are evicted oldest
 * first until the request fits, then any of those whose eviction turned out to be unnecessary are
 * kept again (newest first). Returns the keys to evict, oldest first ([] if it already fits), or
 * null if it cannot fit even with every non-visible tile evicted.
 */
export const planEviction = <K>(
  pools: readonly RangeAllocator[],
  resident: readonly ResidentTile<K>[],
  visible: ReadonlySet<K>,
  sizes: readonly number[],
): K[] | null => {
  if (pools.length !== sizes.length) throw new Error('one size per pool is required');
  if (fitsAll(pools, sizes)) return [];
  const candidates = resident.filter((t) => !visible.has(t.key)).sort((a, b) => a.lastUsed - b.lastUsed);
  let state = pools;
  let count = 0;
  while (count < candidates.length && !fitsAll(state, sizes)) state = freeTile(state, candidates[count++]);
  if (!fitsAll(state, sizes)) return null;
  // drop evictions that are not needed for the fit, preferring to keep the most recently used
  let chosen = candidates.slice(0, count);
  for (let i = chosen.length - 1; i >= 0; i--) {
    const without = [...chosen.slice(0, i), ...chosen.slice(i + 1)];
    if (fitsAll(freeTiles(pools, without), sizes)) chosen = without;
  }
  return chosen.map((t) => t.key);
};
