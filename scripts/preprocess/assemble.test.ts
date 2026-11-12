import { describe, expect, it } from 'vitest';
import { unpackTriInfo } from '../../src/data/meshFormat';
import { assembleCityMesh, dedupeByGmlId, type BuildingRecord } from './assemble';

const rec = (id: string, tris: number, z = 0): BuildingRecord => ({
  attrs: { gmlId: id },
  geometry: {
    lod: 2,
    groundElevation: 1.5,
    positions: Array.from({ length: tris * 9 }, (_, i) => (i % 3 === 2 ? z : i)),
    surfaceTypes: Array.from({ length: tris }, () => 1 as const),
  },
});

describe('dedupeByGmlId', () => {
  it('keeps the first occurrence', () => {
    const out = dedupeByGmlId([rec('a', 1), rec('b', 1), rec('a', 2)]);
    expect(out.map((r) => r.attrs.gmlId)).toEqual(['a', 'b']);
    expect(out[0].geometry.surfaceTypes).toHaveLength(1);
  });
});

describe('assembleCityMesh', () => {
  it('concatenates triangles and records ranges per building', () => {
    const { mesh, buildings } = assembleCityMesh([rec('a', 2), rec('b', 3, 7)]);
    expect(mesh.triInfo).toHaveLength(5);
    expect(Array.from(mesh.buildingRanges)).toEqual([0, 2, 2, 3]);
    expect(unpackTriInfo(mesh.triInfo[3])).toEqual({ buildingIndex: 1, surfaceType: 1 });
    expect(mesh.boundsMax[2]).toBe(7);
    expect(buildings[1]).toEqual({ gmlId: 'b', lod: 2, groundElevation: 1.5 });
  });
});
