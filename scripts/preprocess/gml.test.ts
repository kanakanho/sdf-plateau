import { describe, expect, it } from 'vitest';
import { LOD1_ONLY_BUILDING, LOD2_BUILDING, POLY_WITH_HOLE } from './fixtures/building';
import {
  extractLod1Polygons,
  extractLod2Surfaces,
  isUnknownSentinel,
  parseAttributes,
  parsePolygons,
  parsePosList,
  splitBuildings,
} from './gml';

const collect = async (gen: AsyncGenerator<string>) => {
  const out: string[] = [];
  for await (const x of gen) out.push(x);
  return out;
};

describe('splitBuildings', () => {
  it('yields each building element from a line stream', async () => {
    const lines = [
      '<core:CityModel>',
      '<core:cityObjectMember>',
      '  <bldg:Building gml:id="a">',
      '    <x/>',
      '  </bldg:Building>',
      '</core:cityObjectMember>',
      '<core:cityObjectMember><bldg:Building gml:id="b"><y/></bldg:Building></core:cityObjectMember>',
    ];
    const out = await collect(splitBuildings(lines));
    expect(out).toHaveLength(2);
    expect(out[0].startsWith('<bldg:Building gml:id="a">')).toBe(true);
    expect(out[0].endsWith('</bldg:Building>')).toBe(true);
    expect(out[1]).toBe('<bldg:Building gml:id="b"><y/></bldg:Building>');
  });
  it('ignores BuildingPart tags as starts', async () => {
    const out = await collect(splitBuildings(['<bldg:BuildingPart gml:id="p"></bldg:BuildingPart>']));
    expect(out).toHaveLength(0);
  });
});

describe('parsePosList', () => {
  it('parses triples', () => {
    expect(parsePosList(' 35.1 139.2 3.5 35.2 139.3 4 ')).toEqual([
      [35.1, 139.2, 3.5],
      [35.2, 139.3, 4],
    ]);
  });
  it('rejects malformed lists', () => {
    expect(() => parsePosList('1 2')).toThrow();
    expect(() => parsePosList('1 2 x')).toThrow();
  });
});

describe('parsePolygons', () => {
  it('reads exterior and interior rings', () => {
    const [p] = parsePolygons(POLY_WITH_HOLE);
    expect(p.exterior).toHaveLength(5);
    expect(p.interiors).toHaveLength(1);
    expect(p.interiors[0][1]).toEqual([3, 1, 0]);
  });
});

describe('extractLod2Surfaces', () => {
  it('returns typed thematic surfaces', () => {
    const s = extractLod2Surfaces(LOD2_BUILDING);
    expect(s.map((x) => x.kind)).toEqual(['ground', 'roof', 'wall']);
    expect(s[2].polygons).toHaveLength(4);
  });
  it('returns installations from lod2Geometry', () => {
    const xml = `<bldg:Building gml:id="x"><bldg:lod2Geometry><gml:MultiSurface>${POLY_WITH_HOLE}</gml:MultiSurface></bldg:lod2Geometry></bldg:Building>`;
    expect(extractLod2Surfaces(xml).map((x) => x.kind)).toEqual(['installation']);
  });
  it('is empty for LOD1-only buildings', () => {
    expect(extractLod2Surfaces(LOD1_ONLY_BUILDING)).toEqual([]);
  });
});

describe('extractLod1Polygons', () => {
  it('reads the lod1Solid polygons', () => {
    expect(extractLod1Polygons(LOD1_ONLY_BUILDING)).toHaveLength(6);
  });
});

describe('parseAttributes', () => {
  it('reads the common attributes', () => {
    expect(parseAttributes(LOD2_BUILDING)).toEqual({
      gmlId: 'bldg_test-1',
      buildingId: '13101-bldg-1',
      name: 'テストビル',
      usage: '401',
      buildingClass: '3001',
      measuredHeight: 10,
      storeysAboveGround: 3,
      yearOfConstruction: 1999,
      address: '東京都千代田区丸の内一丁目',
    });
  });
  it('drops sentinel values like -9999', () => {
    const a = parseAttributes(LOD1_ONLY_BUILDING);
    expect(a.gmlId).toBe('bldg_test-2');
    expect(a.measuredHeight).toBeUndefined();
    expect(a.name).toBeUndefined();
  });
  it('treats 9999 storeys as unknown', () => {
    const a = parseAttributes('<bldg:Building gml:id="x"><bldg:storeysAboveGround>9999</bldg:storeysAboveGround></bldg:Building>');
    expect(a.storeysAboveGround).toBeUndefined();
  });
  it('throws without gml:id', () => {
    expect(() => parseAttributes('<bldg:Building></bldg:Building>')).toThrow();
  });
});

describe('isUnknownSentinel', () => {
  it('detects ±9999', () => {
    expect(isUnknownSentinel(9999)).toBe(true);
    expect(isUnknownSentinel(-9999)).toBe(true);
    expect(isUnknownSentinel(99)).toBe(false);
  });
});
