/**
 * Explicit bind group layouts derived from WGSL declarations.
 * ('auto' layouts drop bindings a particular entry point doesn't use, which breaks shared binding sets.)
 */
export type DeclaredBinding = {
  readonly binding: number;
  /** WGSL declaration without @group/@binding, e.g. `var<storage, read> xs: array<f32>;` */
  readonly decl: string;
  readonly resource: GPUBindingResource;
};

const ALL_STAGES = 0x1 | 0x2 | 0x4; // VERTEX | FRAGMENT | COMPUTE

export const layoutEntryFromDecl = (
  binding: number,
  decl: string,
  visibility: GPUShaderStageFlags = ALL_STAGES,
): GPUBindGroupLayoutEntry => {
  const d = decl.replace(/\s+/g, ' ');
  if (d.includes('var<uniform>')) return { binding, visibility, buffer: { type: 'uniform' } };
  if (/var<storage,\s?read_write>/.test(d)) {
    // read_write storage is not allowed in vertex shaders
    return { binding, visibility: visibility & ~0x1, buffer: { type: 'storage' } };
  }
  if (/var<storage(,\s?read)?>/.test(d)) return { binding, visibility, buffer: { type: 'read-only-storage' } };
  const tex = /texture_(2d|3d|cube|2d_array)<(f32|u32|i32)>/.exec(d);
  if (tex) {
    const viewDimension = tex[1].replace('_', '-') as GPUTextureViewDimension;
    const sampleType: GPUTextureSampleType = tex[2] === 'f32' ? 'float' : tex[2] === 'u32' ? 'uint' : 'sint';
    return { binding, visibility, texture: { viewDimension, sampleType } };
  }
  if (/:\s?sampler\s?;/.test(d)) return { binding, visibility, sampler: { type: 'filtering' } };
  throw new Error(`cannot infer binding layout from: ${decl}`);
};

export const createDeclaredLayout = (
  device: GPUDevice,
  bindings: readonly Pick<DeclaredBinding, 'binding' | 'decl'>[],
  visibility?: GPUShaderStageFlags,
  label?: string,
): GPUBindGroupLayout =>
  device.createBindGroupLayout({
    label,
    entries: bindings.map((b) => layoutEntryFromDecl(b.binding, b.decl, visibility)),
  });

export const createDeclaredBindGroup = (
  device: GPUDevice,
  layout: GPUBindGroupLayout,
  bindings: readonly DeclaredBinding[],
): GPUBindGroup =>
  device.createBindGroup({ layout, entries: bindings.map((b) => ({ binding: b.binding, resource: b.resource })) });

export const declarationsSource = (bindings: readonly Pick<DeclaredBinding, 'binding' | 'decl'>[], group = 0): string =>
  bindings.map((b) => `@group(${group}) @binding(${b.binding}) ${b.decl}`).join('\n');
