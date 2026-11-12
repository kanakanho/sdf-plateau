import { describe, expect, it } from 'vitest';
import {
  MESH_MAGIC,
  SurfaceType,
  computeBounds,
  decodeCityMesh,
  encodeCityMesh,
  packTriInfo,
  unpackTriInfo,
} from './meshFormat';

describe('packTriInfo / unpackTriInfo', () => {
  it('round-trips building index and surface type', () => {
    const info = packTriInfo(123456, SurfaceType.Roof);
    expect(unpackTriInfo(info)).toEqual({ buildingIndex: 123456, surfaceType: SurfaceType.Roof });
  });
  it('stays unsigned for large indices', () => {
    expect(packTriInfo(0x1fffffff, 7)).toBe(0xffffffff);
  });
});

describe('computeBounds', () => {
  it('finds min/max per axis', () => {
    const b = computeBounds(new Float32Array([1, 2, 3, -1, 5, 0, 4, -2, 9]));
    expect(b.min).toEqual([-1, -2, 0]);
    expect(b.max).toEqual([4, 5, 9]);
  });
});

describe('encodeCityMesh / decodeCityMesh', () => {
  const mesh = {
    positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 1, 0, 1, 0, 1, 1]),
    triInfo: new Uint32Array([packTriInfo(0, 0), packTriInfo(1, 1)]),
    buildingRanges: new Uint32Array([0, 1, 1, 1]),
    boundsMin: [0, 0, 0] as [number, number, number],
    boundsMax: [1, 1, 1] as [number, number, number],
  };
  it('round-trips all sections', () => {
    const decoded = decodeCityMesh(encodeCityMesh(mesh));
    expect(Array.from(decoded.positions)).toEqual(Array.from(mesh.positions));
    expect(Array.from(decoded.triInfo)).toEqual(Array.from(mesh.triInfo));
    expect(Array.from(decoded.buildingRanges)).toEqual(Array.from(mesh.buildingRanges));
    expect(decoded.boundsMin).toEqual([0, 0, 0]);
    expect(decoded.boundsMax).toEqual([1, 1, 1]);
  });
  it('writes the magic number', () => {
    expect(new Uint32Array(encodeCityMesh(mesh), 0, 1)[0]).toBe(MESH_MAGIC);
  });
  it('rejects foreign buffers', () => {
    expect(() => decodeCityMesh(new ArrayBuffer(64))).toThrow(/SDFP/);
  });
  it('rejects inconsistent input', () => {
    expect(() => encodeCityMesh({ ...mesh, positions: new Float32Array(3) })).toThrow();
  });
});
