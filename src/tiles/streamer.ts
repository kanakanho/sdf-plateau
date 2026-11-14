/**
 * Tile streaming scheduler: keeps the visible tiles of an area resident in the shared pools.
 * Tiles are prepared (fetch + CPU) a few at a time and installed (GPU bake) one at a time, nearest
 * first; when the pools are full, tiles that are no longer visible are evicted least recently used
 * first. Side effects are injected (prepare / install / uninstall), so the scheduling is testable.
 */
import { type RangeAllocator, type ResidentTile, allocRange, createAllocator, freeRange, planEviction } from './allocator';
import type { TileKey } from './select';

export type TilePlacementOf = { readonly resident: number; readonly slotBase: number; readonly paletteStart: number };

/** What the scheduler needs to know about a prepared tile. */
export type PreparedSize = { readonly slotCount: number; readonly paletteEntries: number };

export type StreamerPools = {
  /** atlas capacity in slot rows, and slots per row */
  readonly rows: number;
  readonly rowSlots: number;
  readonly paletteEntries: number;
  readonly residents: number;
};

export type StreamerDeps<T extends PreparedSize> = {
  readonly pools: StreamerPools;
  readonly prepare: (key: TileKey) => Promise<T>;
  readonly install: (key: TileKey, place: TilePlacementOf, tile: T) => Promise<void>;
  readonly uninstall: (key: TileKey) => void;
  readonly onChange?: () => void;
  readonly maxPreparing?: number;
  readonly log?: (message: string) => void;
};

export type StreamerStats = {
  readonly resident: number;
  readonly preparing: number;
  readonly waiting: number;
  readonly rowsUsed: number;
  readonly rowsTotal: number;
  readonly failed: number;
  /** visible tiles that do not fit in the pools */
  readonly noRoom: number;
};

export type Streamer = {
  /** visible tiles, most important first */
  readonly setVisible: (keys: readonly TileKey[]) => void;
  readonly stats: () => StreamerStats;
  readonly residentKeys: () => TileKey[];
  /** resolves when nothing is being prepared or installed (for tests and status updates) */
  readonly idle: () => Promise<void>;
};

/** Rows of `rowSlots` slots needed by `slotCount` slots. */
export const rowsFor = (slotCount: number, rowSlots: number): number => Math.ceil(slotCount / rowSlots);

/** First visible tile that is neither resident, being prepared, waiting for install, nor failed. */
export const nextToPrepare = (visible: readonly TileKey[], busy: (key: TileKey) => boolean): TileKey | undefined =>
  visible.find((k) => !busy(k));

export const createStreamer = <T extends PreparedSize>(deps: StreamerDeps<T>): Streamer => {
  const { pools } = deps;
  const maxPreparing = deps.maxPreparing ?? 2;
  let allocators: RangeAllocator[] = [createAllocator(pools.rows), createAllocator(pools.paletteEntries), createAllocator(pools.residents)];
  const resident = new Map<TileKey, ResidentTile<TileKey>>();
  const preparing = new Set<TileKey>();
  const waiting = new Map<TileKey, T>();
  const failed = new Set<TileKey>();
  /** tiles that did not fit next to the visible ones; retried once the view changes */
  const noRoom = new Set<TileKey>();
  let visible: readonly TileKey[] = [];
  let visibleSet = new Set<TileKey>();
  let stamp = 0;
  let installing: Promise<void> | null = null;
  let installingKey: TileKey | null = null;
  let idleWaiters: (() => void)[] = [];

  const busy = (k: TileKey) => resident.has(k) || preparing.has(k) || waiting.has(k) || failed.has(k) || noRoom.has(k) || k === installingKey;

  const checkIdle = () => {
    if (preparing.size || waiting.size || installing) return;
    const w = idleWaiters;
    idleWaiters = [];
    w.forEach((f) => f());
  };

  const evict = (key: TileKey) => {
    const t = resident.get(key)!;
    deps.uninstall(key);
    allocators = allocators.map((a, i) => freeRange(a, t.ranges[i].start, t.ranges[i].size));
    resident.delete(key);
  };

  const installOne = async (key: TileKey, tile: T) => {
    const sizes = [rowsFor(tile.slotCount, pools.rowSlots), tile.paletteEntries, 1];
    const victims = planEviction(allocators, [...resident.values()], visibleSet, sizes);
    if (victims === null) {
      noRoom.add(key);
      deps.log?.(`tile ${key} does not fit (${tile.slotCount} slots, ${tile.paletteEntries} palette entries)`);
      return;
    }
    victims.forEach(evict);
    const ranges = sizes.map((size, i) => {
      const r = allocRange(allocators[i], size)!;
      allocators[i] = r.allocator;
      return { start: r.start, size };
    });
    const place = { slotBase: ranges[0].start * pools.rowSlots, paletteStart: ranges[1].start, resident: ranges[2].start };
    try {
      await deps.install(key, place, tile);
      resident.set(key, { key, lastUsed: stamp, ranges });
    } catch (err) {
      allocators = allocators.map((a, i) => freeRange(a, ranges[i].start, ranges[i].size));
      failed.add(key);
      deps.log?.(`tile ${key} failed to install: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const pumpInstall = () => {
    if (installing) return;
    // nearest visible tile first; prepared tiles that left the view are dropped (re-fetched later)
    for (const k of [...waiting.keys()]) if (!visibleSet.has(k)) waiting.delete(k);
    const key = visible.find((k) => waiting.has(k));
    if (key === undefined) return checkIdle();
    const tile = waiting.get(key)!;
    waiting.delete(key);
    installingKey = key;
    installing = installOne(key, tile).finally(() => {
      installing = null;
      installingKey = null;
      deps.onChange?.();
      pumpInstall();
      pumpPrepare();
    });
  };

  const pumpPrepare = () => {
    while (preparing.size < maxPreparing) {
      const key = nextToPrepare(visible, busy);
      if (key === undefined) break;
      preparing.add(key);
      deps
        .prepare(key)
        .then(
          (tile) => waiting.set(key, tile),
          (err: unknown) => {
            failed.add(key);
            deps.log?.(`tile ${key} failed to load: ${err instanceof Error ? err.message : String(err)}`);
          },
        )
        .finally(() => {
          preparing.delete(key);
          pumpInstall();
          pumpPrepare();
        });
    }
    checkIdle();
  };

  return {
    setVisible: (keys) => {
      if (keys.length !== visible.length || keys.some((k, i) => k !== visible[i])) noRoom.clear();
      visible = keys;
      visibleSet = new Set(keys);
      stamp++;
      for (const k of keys) {
        const t = resident.get(k);
        if (t) resident.set(k, { ...t, lastUsed: stamp });
      }
      pumpInstall();
      pumpPrepare();
    },
    stats: () => ({
      resident: resident.size,
      preparing: preparing.size,
      waiting: waiting.size,
      rowsUsed: pools.rows - allocators[0].free.reduce((s, r) => s + r.size, 0),
      rowsTotal: pools.rows,
      failed: failed.size,
      noRoom: noRoom.size,
    }),
    residentKeys: () => [...resident.keys()],
    idle: () =>
      new Promise<void>((resolve) => {
        idleWaiters.push(resolve);
        checkIdle();
      }),
  };
};
