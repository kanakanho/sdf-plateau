import { describe, expect, it } from 'vitest';
import { type AreaTile, WAVES_SLUG, areaDescription, homeTileIndex, parseAreaList, tilePath, upsertAreaSummary, wavesAreaDescription } from './area';

describe('tilePath', () => {
  it('names tile files by grid position', () => {
    expect(tilePath(3, 12, 'bin.gz')).toBe('tiles/3_12.bin.gz');
    expect(tilePath(0, 0, 'json.gz')).toBe('tiles/0_0.json.gz');
  });
});

describe('homeTileIndex', () => {
  const tiles: AreaTile[] = [
    { ix: 0, iy: 0, buildingStart: 0, count: 3, maxZ: 10 },
    { ix: 1, iy: 0, buildingStart: 3, count: 0, maxZ: 10 },
    { ix: 2, iy: 0, buildingStart: 3, count: 2, maxZ: 10 },
    { ix: 0, iy: 1, buildingStart: 5, count: 4, maxZ: 10 },
  ];
  it('finds the tile whose home range contains the index', () => {
    expect([0, 2, 3, 4, 5, 8].map((b) => homeTileIndex(tiles, b))).toEqual([0, 0, 2, 2, 3, 3]);
  });
  it('returns -1 outside every range', () => {
    expect(homeTileIndex(tiles, 9)).toBe(-1);
    expect(homeTileIndex([], 0)).toBe(-1);
  });
});

describe('upsertAreaSummary', () => {
  it('adds new areas sorted by slug', () => {
    expect(upsertAreaSummary([{ slug: 'nagoya', name: '名古屋市' }], { slug: 'chiyodaku', name: '千代田区' })).toEqual([
      { slug: 'chiyodaku', name: '千代田区' },
      { slug: 'nagoya', name: '名古屋市' },
    ]);
  });
  it('replaces an existing area', () => {
    expect(upsertAreaSummary([{ slug: 'a', name: 'old' }], { slug: 'a', name: 'new' })).toEqual([{ slug: 'a', name: 'new' }]);
  });
});

describe('parseAreaList', () => {
  it('keeps well-formed entries and tolerates missing or invalid input', () => {
    expect(parseAreaList(null)).toEqual([]);
    expect(parseAreaList('{}')).toEqual([]);
    expect(parseAreaList('[{"slug":"nagoya","name":"名古屋市"},{"slug":1},null]')).toEqual([{ slug: 'nagoya', name: '名古屋市' }]);
  });
  it('drops an area that would collide with the reserved /waves/ page', () => {
    expect(parseAreaList(`[{"slug":"${WAVES_SLUG}","name":"x"},{"slug":"nagoya","name":"名古屋市"}]`)).toEqual([{ slug: 'nagoya', name: '名古屋市' }]);
  });
});

describe('wavesAreaDescription', () => {
  it('names the area, LOD1 and the distance-field waves', () => {
    const d = wavesAreaDescription('名古屋市');
    expect(d).toContain('名古屋市・LOD1');
    expect(d).toContain('距離関数');
  });
});

describe('areaDescription', () => {
  it('names the area and LOD1', () => {
    expect(areaDescription('千代田区')).toContain('千代田区・LOD1');
  });
});
