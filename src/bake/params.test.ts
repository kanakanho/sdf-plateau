import { describe, expect, it } from 'vitest';
import { computeAtlasLayout } from './atlasLayout';
import { computeGridSpec } from './gridSpec';
import { alignTo, dispatchSize, packBakeParams, packPackParams, packSceneParams } from './params';

const spec = computeGridSpec([0, 0, 0], [30, 10, 5], { voxelSize: 1 });

describe('packBakeParams', () => {
  it('lays out fields as struct BakeParams', () => {
    const buf = packBakeParams(4, 7, 9, 100);
    expect(buf.byteLength).toBe(16);
    expect(new Float32Array(buf)[0]).toBe(4);
    expect(Array.from(new Uint32Array(buf).subarray(1, 4))).toEqual([7, 9, 100]);
  });
});

describe('packPackParams', () => {
  it('lays out fields as struct PackParams', () => {
    const buf = packPackParams({ width: 1152, rows: 18, bytesPerRow: 1280, slotCount: 200 }, 4, 128, 3);
    const u = new Uint32Array(buf);
    expect(buf.byteLength).toBe(32);
    expect(Array.from(u.subarray(0, 4))).toEqual([1152, 18, 320, 200]);
    expect(new Float32Array(buf)[4]).toBe(4);
    expect(u[5]).toBe(128);
    expect(u[6]).toBe(3);
    expect(u[7]).toBe(0);
  });
  it('encodes the pack mode (1 = palette indices)', () => {
    const buf = packPackParams({ width: 1152, rows: 9, bytesPerRow: 1280, slotCount: 1 }, 4, 128, 1, 1);
    expect(new Uint32Array(buf)[7]).toBe(1);
  });
});

describe('packSceneParams', () => {
  it('lays out fields as struct SceneParams', () => {
    const layout = computeAtlasLayout(10);
    const buf = packSceneParams(spec, layout, 2, 10);
    const f = new Float32Array(buf);
    const u = new Uint32Array(buf);
    expect(buf.byteLength).toBe(64);
    expect(Array.from(f.subarray(8, 12))).toEqual([1152, 9, 9, 8]);
    expect(Array.from(u.subarray(12, 16))).toEqual([128, 1, 2, 10]);
  });
});

describe('dispatchSize', () => {
  it('fits in one dimension when small', () => {
    expect(dispatchSize(100)).toEqual([2, 1]);
  });
  it('spills into y beyond the per-dimension limit', () => {
    expect(dispatchSize(64 * 70000)).toEqual([65535, 2]);
  });
});

describe('alignTo', () => {
  it('rounds up to a multiple', () => {
    expect(alignTo(1152, 256)).toBe(1280);
    expect(alignTo(256, 256)).toBe(256);
  });
});
