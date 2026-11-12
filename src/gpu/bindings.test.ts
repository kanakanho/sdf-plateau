import { describe, expect, it } from 'vitest';
import { createBufferFromData } from './buffers';
import { createDeclaredBindGroup, createDeclaredLayout, declarationsSource, layoutEntryFromDecl } from './bindings';
import { withValidation } from './shader';
import { getTestDevice } from './testDevice';

describe('layoutEntryFromDecl', () => {
  it('maps uniform and storage buffers', () => {
    expect(layoutEntryFromDecl(0, 'var<uniform> u: P;').buffer).toEqual({ type: 'uniform' });
    expect(layoutEntryFromDecl(1, 'var<storage, read> a: array<f32>;').buffer).toEqual({ type: 'read-only-storage' });
    expect(layoutEntryFromDecl(1, 'var<storage> a: array<f32>;').buffer).toEqual({ type: 'read-only-storage' });
  });
  it('removes the vertex stage for read_write storage', () => {
    const e = layoutEntryFromDecl(2, 'var<storage, read_write> a: array<f32>;', 0x7);
    expect(e.buffer).toEqual({ type: 'storage' });
    expect(e.visibility).toBe(0x6);
  });
  it('maps textures and samplers', () => {
    expect(layoutEntryFromDecl(3, 'var t: texture_3d<f32>;').texture).toEqual({ viewDimension: '3d', sampleType: 'float' });
    expect(layoutEntryFromDecl(3, 'var t: texture_2d<u32>;').texture).toEqual({ viewDimension: '2d', sampleType: 'uint' });
    expect(layoutEntryFromDecl(4, 'var s: sampler;').sampler).toEqual({ type: 'filtering' });
  });
  it('rejects unknown declarations', () => {
    expect(() => layoutEntryFromDecl(0, 'var x: f32;')).toThrow();
  });
});

describe('declarationsSource', () => {
  it('prefixes group and binding', () => {
    expect(declarationsSource([{ binding: 3, decl: 'var s: sampler;' }], 1)).toBe('@group(1) @binding(3) var s: sampler;');
  });
});

describe('createDeclaredLayout / createDeclaredBindGroup', () => {
  it('creates a valid layout and bind group', async () => {
    const device = await getTestDevice();
    const buf = createBufferFromData(device, new Float32Array(4), GPUBufferUsage.STORAGE);
    const bindings = [{ binding: 5, decl: 'var<storage, read> a: array<f32>;', resource: { buffer: buf } }];
    await withValidation(device, () => {
      const layout = createDeclaredLayout(device, bindings, GPUShaderStage.COMPUTE);
      createDeclaredBindGroup(device, layout, bindings);
    });
  });
});
