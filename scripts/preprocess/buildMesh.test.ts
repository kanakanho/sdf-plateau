import { describe, expect, it } from 'vitest';
import { SurfaceType } from '../../src/data/meshFormat';
import { createLocalFrame } from '../../src/geo/localFrame';
import { windingNumber } from '../../src/geom/triangle';
import {
  buildingGeometry,
  classifyByNormal,
  groundElevationOf,
  surfaceKindToType,
  toLocal,
  triangulateToLocal,
} from './buildMesh';
import { LOD1_ONLY_BUILDING, LOD2_BUILDING, corners } from './fixtures/building';

const frame = createLocalFrame(corners[0][1], corners[0][0]);

describe('surfaceKindToType', () => {
  it('maps kinds to codes', () => {
    expect(surfaceKindToType('roof')).toBe(SurfaceType.Roof);
    expect(surfaceKindToType('installation')).toBe(SurfaceType.Installation);
  });
});

describe('classifyByNormal', () => {
  it('classifies by the z component', () => {
    expect(classifyByNormal(0.9)).toBe(SurfaceType.Roof);
    expect(classifyByNormal(-0.9)).toBe(SurfaceType.Ground);
    expect(classifyByNormal(0.1)).toBe(SurfaceType.Wall);
  });
});

describe('toLocal', () => {
  it('maps (lat, lon, h) to local meters relative to the ground', () => {
    const p = toLocal(frame, [corners[0][0], corners[0][1], 5], 2);
    expect(p[0]).toBeCloseTo(0, 6);
    expect(p[1]).toBeCloseTo(0, 6);
    expect(p[2]).toBe(3);
  });
});

describe('groundElevationOf', () => {
  const poly = (h: number) => ({ exterior: [[0, 0, h] as const, [0, 1, h + 1] as const], interiors: [] });
  it('prefers ground surfaces', () => {
    expect(groundElevationOf([poly(3)], [poly(1)])).toBe(3);
  });
  it('falls back to the lowest vertex', () => {
    expect(groundElevationOf([], [poly(5), poly(1)])).toBe(1);
  });
  it('is 0 without geometry', () => {
    expect(groundElevationOf([], [])).toBe(0);
  });
});

describe('triangulateToLocal', () => {
  it('drops slivers below the area threshold', () => {
    const tiny = { exterior: [[35, 139, 0], [35, 139.0000000001, 0], [35.0000000001, 139, 0]] as const, interiors: [] };
    expect(triangulateToLocal(frame, { exterior: [...tiny.exterior], interiors: [] }, 0)).toEqual([]);
  });
});

describe('buildingGeometry', () => {
  it('builds a closed LOD2 box from thematic surfaces', () => {
    const g = buildingGeometry(LOD2_BUILDING, frame)!;
    expect(g.lod).toBe(2);
    expect(g.groundElevation).toBe(2);
    expect(g.surfaceTypes).toHaveLength(12);
    expect(g.surfaceTypes.filter((t) => t === SurfaceType.Roof)).toHaveLength(2);
    const zs = g.positions.filter((_, i) => i % 3 === 2);
    expect(Math.min(...zs)).toBeCloseTo(0, 6);
    expect(Math.max(...zs)).toBeCloseTo(10, 6);
    // the box is watertight: |winding| is 1 in the middle, 0 outside
    expect(Math.abs(windingNumber([5, 5, 5], g.positions))).toBeCloseTo(1, 6);
    expect(windingNumber([50, 5, 5], g.positions)).toBeCloseTo(0, 6);
  });
  it('falls back to LOD1 and classifies faces by normal', () => {
    const g = buildingGeometry(LOD1_ONLY_BUILDING, frame)!;
    expect(g.lod).toBe(1);
    expect(g.surfaceTypes.filter((t) => t === SurfaceType.Roof)).toHaveLength(2);
    expect(g.surfaceTypes.filter((t) => t === SurfaceType.Ground)).toHaveLength(2);
    expect(g.surfaceTypes.filter((t) => t === SurfaceType.Wall)).toHaveLength(8);
  });
  it('returns null without geometry', () => {
    expect(buildingGeometry('<bldg:Building gml:id="x"></bldg:Building>', frame)).toBeNull();
  });
});
