import { describe, expect, it } from 'vitest';
import { type PreparedSize, createStreamer, nextToPrepare, rowsFor } from './streamer';

describe('rowsFor / nextToPrepare', () => {
  it('rounds slots up to whole rows', () => {
    expect([rowsFor(0, 128), rowsFor(1, 128), rowsFor(128, 128), rowsFor(129, 128)]).toEqual([0, 1, 1, 2]);
  });
  it('picks the first visible tile that is not busy', () => {
    expect(nextToPrepare([4, 2, 9], (k) => k === 4)).toBe(2);
    expect(nextToPrepare([4], () => true)).toBeUndefined();
  });
});

type Tile = PreparedSize & { key: number };

const setup = (sizes: Record<number, number>, pools = { rows: 4, rowSlots: 10, paletteEntries: 100, residents: 3 }) => {
  const log: string[] = [];
  let changes = 0;
  const installed = new Map<number, { resident: number; slotBase: number }>();
  const streamer = createStreamer<Tile>({
    pools,
    prepare: async (key) => {
      if (!(key in sizes)) throw new Error('404');
      return { key, slotCount: sizes[key], paletteEntries: 5 };
    },
    install: async (key, place) => {
      installed.set(key, place);
      log.push(`+${key}`);
    },
    uninstall: (key) => {
      installed.delete(key);
      log.push(`-${key}`);
    },
    onChange: () => changes++,
  });
  return { streamer, log, installed, changes: () => changes };
};

describe('createStreamer', () => {
  it('loads visible tiles nearest first into disjoint placements', async () => {
    const { streamer, log, installed } = setup({ 1: 10, 2: 15, 3: 5 });
    streamer.setVisible([2, 1, 3]);
    await streamer.idle();
    expect(log).toEqual(['+2', '+1', '+3']);
    const places = [...installed.values()];
    expect(new Set(places.map((p) => p.resident)).size).toBe(3);
    expect(places.map((p) => p.slotBase).sort((a, b) => a - b)).toEqual([0, 20, 30]);
    expect(streamer.stats()).toMatchObject({ resident: 3, rowsUsed: 4, rowsTotal: 4, failed: 0 });
  });

  it('evicts tiles that left the view, least recently used first, and never visible ones', async () => {
    const { streamer, log } = setup({ 1: 10, 2: 10, 3: 10, 4: 10, 5: 10 });
    streamer.setVisible([1, 2, 3]);
    await streamer.idle();
    streamer.setVisible([2, 4]); // 1 and 3 left the view with the same stamp: the earlier loaded goes first
    await streamer.idle();
    expect(log.slice(3)).toEqual(['-1', '+4']);
    streamer.setVisible([2, 4, 5]);
    await streamer.idle();
    expect(log.slice(5)).toEqual(['-3', '+5']);
    expect(streamer.residentKeys().sort()).toEqual([2, 4, 5]);
  });

  it('skips tiles that fail to load or do not fit, and retries the latter after the view changes', async () => {
    const { streamer, log, changes } = setup({ 1: 1000, 3: 10 });
    streamer.setVisible([1, 2, 3]);
    await streamer.idle();
    expect(log).toEqual(['+3']);
    // every install attempt (also the one that did not fit) is reported
    expect(changes()).toBe(2);
    expect(streamer.stats()).toMatchObject({ failed: 1, noRoom: 1 });
    streamer.setVisible([1, 2, 3]);
    expect(streamer.stats().noRoom).toBe(1);
    streamer.setVisible([3, 1]);
    expect(streamer.stats().noRoom).toBe(0);
    await streamer.idle();
    expect(streamer.stats()).toMatchObject({ failed: 1, noRoom: 1 });
  });

  it('drops prepared tiles that are no longer visible before installing them', async () => {
    const { streamer, log } = setup({ 1: 10, 2: 10 });
    streamer.setVisible([1, 2]);
    streamer.setVisible([2]);
    await streamer.idle();
    expect(log).toEqual(['+2']);
  });
});
