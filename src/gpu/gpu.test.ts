import { describe, expect, it } from 'vitest';
import { createBufferFromData, createEmptyBuffer, readBuffer } from './buffers';
import { buildHarnessSource, evalWgsl, packVec4Inputs, unpackVec4Outputs } from './harness';
import { createCheckedShaderModule, formatCompilationMessages, withValidation } from './shader';
import { getTestDevice } from './testDevice';

describe('buffers', () => {
  it('createBufferFromData + readBuffer round-trip', async () => {
    const device = await getTestDevice();
    const data = new Uint32Array([1, 2, 3, 0xdeadbeef]);
    const buf = createBufferFromData(device, data, GPUBufferUsage.COPY_SRC);
    expect(Array.from(new Uint32Array(await readBuffer(device, buf, 16)))).toEqual(Array.from(data));
  });
  it('createBufferFromData pads odd sizes to 4 bytes and min 16', async () => {
    const device = await getTestDevice();
    const buf = createBufferFromData(device, new Uint8Array([1, 2, 3]), GPUBufferUsage.COPY_SRC);
    expect(buf.size).toBe(16);
  });
  it('createEmptyBuffer reserves aligned space', async () => {
    const device = await getTestDevice();
    expect(createEmptyBuffer(device, 21, GPUBufferUsage.STORAGE).size).toBe(24);
  });
  it('readBuffer honours source offset', async () => {
    const device = await getTestDevice();
    const buf = createBufferFromData(device, new Uint32Array([5, 6, 7, 8]), GPUBufferUsage.COPY_SRC);
    expect(Array.from(new Uint32Array(await readBuffer(device, buf, 8, 8)))).toEqual([7, 8]);
  });
});

describe('shader', () => {
  it('formatCompilationMessages keeps only errors', () => {
    expect(
      formatCompilationMessages([
        { type: 'warning', lineNum: 1, linePos: 1, message: 'w' },
        { type: 'error', lineNum: 3, linePos: 7, message: 'bad' },
      ]),
    ).toBe('3:7 bad');
  });
  it('createCheckedShaderModule rejects invalid WGSL', async () => {
    const device = await getTestDevice();
    await expect(createCheckedShaderModule(device, 'fn broken( {')).rejects.toThrow(/WGSL compile error/);
  });
  it('createCheckedShaderModule accepts valid WGSL', async () => {
    const device = await getTestDevice();
    await expect(createCheckedShaderModule(device, 'fn ok() -> f32 { return 1.0; }')).resolves.toBeDefined();
  });
  it('withValidation throws on validation errors', async () => {
    const device = await getTestDevice();
    await expect(
      withValidation(device, () => device.createBuffer({ size: 4, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.STORAGE })),
    ).rejects.toThrow(/validation/);
  });
});

describe('harness', () => {
  it('buildHarnessSource embeds prelude, body and extra bindings', () => {
    const src = buildHarnessSource({
      prelude: 'fn foo() {}',
      body: 'return v;',
      extra: [{ binding: 2, decl: 'var<storage, read> xs: array<f32>;', resource: {} as GPUBindingResource }],
    });
    expect(src).toContain('fn foo() {}');
    expect(src).toContain('return v;');
    expect(src).toContain('@group(0) @binding(2) var<storage, read> xs: array<f32>;');
  });
  it('packVec4Inputs pads to vec4', () => {
    expect(Array.from(packVec4Inputs([[1], [2, 3, 4, 5]]))).toEqual([1, 0, 0, 0, 2, 3, 4, 5]);
    expect(() => packVec4Inputs([[1, 2, 3, 4, 5]])).toThrow();
  });
  it('unpackVec4Outputs splits into rows', () => {
    expect(unpackVec4Outputs(new Float32Array([1, 2, 3, 4, 5, 6, 7, 8]), 2)).toEqual([
      [1, 2, 3, 4],
      [5, 6, 7, 8],
    ]);
  });
  it('evalWgsl runs a function on the GPU', async () => {
    const device = await getTestDevice();
    const out = await evalWgsl(device, {
      prelude: 'fn double(x: vec4f) -> vec4f { return x * 2.0; }',
      body: 'return double(v);',
      inputs: [[1, 2, 3, 4], [-1, 0, 0.5, 8]],
    });
    expect(out).toEqual([[2, 4, 6, 8], [-2, 0, 1, 16]]);
  });
  it('evalWgsl supports extra storage bindings', async () => {
    const device = await getTestDevice();
    const xs = createBufferFromData(device, new Float32Array([10, 20, 30, 40]), GPUBufferUsage.STORAGE);
    const out = await evalWgsl(device, {
      prelude: '',
      body: 'return vec4f(xs[u32(v.x)]);',
      inputs: [[2], [0]],
      extra: [{ binding: 2, decl: 'var<storage, read> xs: array<f32>;', resource: { buffer: xs } }],
    });
    expect(out.map((r) => r[0])).toEqual([30, 10]);
  });
});
