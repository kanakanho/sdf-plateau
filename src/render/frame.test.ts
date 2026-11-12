import { describe, expect, it } from 'vitest';
import { identity, transformVec4 } from '../geo/mat4';
import { FRAME_BYTES, buildingAttributeArray, buildingTopHeights, glToWebGpuClip, packFrameParams } from './frame';

describe('packFrameParams', () => {
  it('writes fields at the FrameParams offsets', () => {
    const vp = Array.from({ length: 16 }, (_, i) => i);
    const buf = packFrameParams({
      viewProj: vp,
      invViewProj: identity(),
      sunDir: [0, 0.6, 0.8],
      sunIntensity: 0.9,
      viewport: [800, 600],
      time: 12,
      colorMode: 2,
      flags: 5,
      selected: 42,
      maxSteps: 200,
    });
    const f = new Float32Array(buf);
    const u = new Uint32Array(buf);
    expect(buf.byteLength).toBe(FRAME_BYTES);
    expect(Array.from(f.subarray(0, 16))).toEqual(vp);
    expect(f[16]).toBe(1);
    expect(Array.from(f.subarray(32, 36)).map((x) => +x.toFixed(4))).toEqual([0, 0.6, 0.8, 0.9]);
    expect(Array.from(f.subarray(36, 39))).toEqual([800, 600, 12]);
    expect(Array.from(u.subarray(40, 44))).toEqual([2, 5, 42, 200]);
  });
});

describe('glToWebGpuClip', () => {
  it('maps z = -w to 0 and z = w to w', () => {
    const m = glToWebGpuClip(identity());
    expect(transformVec4(m, [0, 0, -1, 1])[2]).toBe(0);
    expect(transformVec4(m, [0, 0, 1, 1])[2]).toBe(1);
    expect(transformVec4(m, [3, 4, 0, 1]).slice(0, 2)).toEqual([3, 4]);
  });
});

describe('buildingAttributeArray', () => {
  it('packs height, usage category, year and lod', () => {
    const out = buildingAttributeArray(
      [
        { gmlId: 'a', lod: 2, groundElevation: 0, measuredHeight: 50, usage: '401', yearOfConstruction: 2001 },
        { gmlId: 'b', lod: 1, groundElevation: 0 },
      ],
      [10, 33],
    );
    expect(Array.from(out)).toEqual([50, 1, 2001, 2, 33, 0, 0, 1]);
  });
  it('never returns an empty buffer', () => {
    expect(buildingAttributeArray([])).toHaveLength(4);
  });
});

describe('buildingTopHeights', () => {
  it('takes the max z per building range', () => {
    const pos = new Float32Array([0, 0, 1, 0, 0, 5, 0, 0, 2, 0, 0, 7, 0, 0, 3, 0, 0, 0]);
    expect(Array.from(buildingTopHeights(pos, new Uint32Array([0, 1, 1, 1])))).toEqual([5, 7]);
  });
});
