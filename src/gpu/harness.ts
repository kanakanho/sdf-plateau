/**
 * WGSL unit-test harness: wraps a function body into a minimal compute shader,
 * runs it over an array of vec4f inputs and returns the vec4f outputs.
 */
import { createDeclaredBindGroup, createDeclaredLayout } from './bindings';
import { createBufferFromData, createEmptyBuffer, readBuffer } from './buffers';
import { createCheckedShaderModule, withValidation } from './shader';

export type ExtraResource = {
  readonly binding: number;
  /** WGSL declaration without the @group/@binding prefix, e.g. `var<storage, read> tris: array<f32>;` */
  readonly decl: string;
  readonly resource: GPUBindingResource;
};

export type WgslEvalOptions = {
  /** WGSL source with the functions under test (and their dependencies). */
  readonly prelude: string;
  /** Body of `fn testFn(v: vec4f) -> vec4f`. */
  readonly body: string;
  readonly inputs: readonly (readonly number[])[];
  readonly extra?: readonly ExtraResource[];
};

export const buildHarnessSource = (opts: Pick<WgslEvalOptions, 'prelude' | 'body' | 'extra'>): string => {
  const extraDecls = (opts.extra ?? [])
    .map((e) => `@group(0) @binding(${e.binding}) ${e.decl}`)
    .join('\n');
  return /* wgsl */ `
@group(0) @binding(0) var<storage, read> harnessInputs: array<vec4f>;
@group(0) @binding(1) var<storage, read_write> harnessOutputs: array<vec4f>;
${extraDecls}
${opts.prelude}
fn testFn(v: vec4f) -> vec4f {
${opts.body}
}
@compute @workgroup_size(64)
fn harnessMain(@builtin(global_invocation_id) id: vec3u) {
  if (id.x >= arrayLength(&harnessInputs)) { return; }
  harnessOutputs[id.x] = testFn(harnessInputs[id.x]);
}
`;
};

export const packVec4Inputs = (inputs: readonly (readonly number[])[]): Float32Array => {
  const out = new Float32Array(Math.max(1, inputs.length) * 4);
  inputs.forEach((v, i) => {
    if (v.length > 4) throw new Error(`input ${i} has more than 4 components`);
    out.set(v, i * 4);
  });
  return out;
};

export const unpackVec4Outputs = (data: Float32Array, count: number): number[][] =>
  Array.from({ length: count }, (_, i) => Array.from(data.subarray(i * 4, i * 4 + 4)));

export const evalWgsl = async (device: GPUDevice, opts: WgslEvalOptions): Promise<number[][]> => {
  const code = buildHarnessSource(opts);
  const module = await createCheckedShaderModule(device, code, 'harness');
  const inputData = packVec4Inputs(opts.inputs);
  const input = createBufferFromData(device, inputData, GPUBufferUsage.STORAGE);
  const output = createEmptyBuffer(
    device,
    inputData.byteLength,
    GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
  );
  await withValidation(device, () => {
    const bindings = [
      { binding: 0, decl: 'var<storage, read> harnessInputs: array<vec4f>;', resource: { buffer: input } },
      { binding: 1, decl: 'var<storage, read_write> harnessOutputs: array<vec4f>;', resource: { buffer: output } },
      ...(opts.extra ?? []),
    ];
    const bindGroupLayout = createDeclaredLayout(device, bindings, GPUShaderStage.COMPUTE);
    const pipeline = device.createComputePipeline({
      layout: device.createPipelineLayout({ bindGroupLayouts: [bindGroupLayout] }),
      compute: { module, entryPoint: 'harnessMain' },
    });
    const bindGroup = createDeclaredBindGroup(device, bindGroupLayout, bindings);
    const encoder = device.createCommandEncoder();
    const pass = encoder.beginComputePass();
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.dispatchWorkgroups(Math.ceil(opts.inputs.length / 64));
    pass.end();
    device.queue.submit([encoder.finish()]);
  });
  const result = new Float32Array(await readBuffer(device, output, inputData.byteLength));
  input.destroy();
  output.destroy();
  return unpackVec4Outputs(result, opts.inputs.length);
};
