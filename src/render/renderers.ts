/**
 * Raster (reference) and SDF render pipelines. Both write premultiplied colour plus an r32uint
 * building-id target (index + 1, 0 = nothing) used for picking and for the raster/SDF diff test.
 */
import { type DeclaredBinding, createDeclaredBindGroup, createDeclaredLayout, declarationsSource } from '../gpu/bindings';
import { createBufferFromData, readBuffer } from '../gpu/buffers';
import { createCheckedShaderModule } from '../gpu/shader';
import { linkWgsl } from '../wgsl/link';
import { rasterShader, sdfRenderShader, sdfTiledRenderShader, sdfTiledWaveShellRenderShader, sdfWaveShellRenderShader } from '../wgsl/modules';
import { FRAME_BYTES } from './frame';
import { type SceneResources, sceneBindings } from './scene';
import { type TiledSceneResources, tiledSceneBindings } from './tiledScene';

export const ID_FORMAT: GPUTextureFormat = 'r32uint';
export const DEPTH_FORMAT: GPUTextureFormat = 'depth24plus';

export type FrameResources = { readonly frame: GPUBuffer; readonly attrs: GPUBuffer };

export const createFrameResources = (device: GPUDevice, attrs: Float32Array): FrameResources => ({
  frame: device.createBuffer({ label: 'frame', size: FRAME_BYTES, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST }),
  attrs: createBufferFromData(device, attrs, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST, 'building-attrs'),
});

const frameBindings = (f: FrameResources): DeclaredBinding[] => [
  { binding: 0, decl: 'var<uniform> frame: FrameParams;', resource: { buffer: f.frame } },
  { binding: 1, decl: 'var<storage, read> buildingAttrs: array<vec4f>;', resource: { buffer: f.attrs } },
];

export type SurfaceRenderer = {
  readonly pipeline: GPURenderPipeline;
  readonly bindGroup: GPUBindGroup;
  readonly vertexCount: number;
  readonly usesDepth: boolean;
};

const colorTargets = (format: GPUTextureFormat): GPUColorTargetState[] => [{ format }, { format: ID_FORMAT }];

const buildPipeline = async (
  device: GPUDevice,
  label: string,
  bindings: DeclaredBinding[],
  body: string,
  entry: { vs: string; fs: string },
  format: GPUTextureFormat,
  depth: boolean,
): Promise<{ pipeline: GPURenderPipeline; bindGroup: GPUBindGroup }> => {
  const code = `${declarationsSource(bindings)}\n${body}`;
  const module = await createCheckedShaderModule(device, code, label);
  const layout = createDeclaredLayout(device, bindings, GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, label);
  const pipeline = await device.createRenderPipelineAsync({
    label,
    layout: device.createPipelineLayout({ bindGroupLayouts: [layout] }),
    vertex: { module, entryPoint: entry.vs },
    fragment: { module, entryPoint: entry.fs, targets: colorTargets(format) },
    primitive: { topology: 'triangle-list', cullMode: 'none' },
    depthStencil: depth ? { format: DEPTH_FORMAT, depthWriteEnabled: true, depthCompare: 'less' } : undefined,
  });
  return { pipeline, bindGroup: createDeclaredBindGroup(device, layout, bindings) };
};

export type RasterSource = { readonly tris: GPUBuffer; readonly triInfo: GPUBuffer; readonly triCount: number };

export const createRasterRenderer = async (
  device: GPUDevice,
  format: GPUTextureFormat,
  frame: FrameResources,
  mesh: RasterSource,
): Promise<SurfaceRenderer> => {
  const bindings: DeclaredBinding[] = [
    ...frameBindings(frame),
    { binding: 2, decl: 'var<storage, read> sceneTris: array<f32>;', resource: { buffer: mesh.tris } },
    { binding: 3, decl: 'var<storage, read> sceneTriInfo: array<u32>;', resource: { buffer: mesh.triInfo } },
  ];
  const { pipeline, bindGroup } = await buildPipeline(
    device, 'raster', bindings, linkWgsl(rasterShader), { vs: 'rasterVs', fs: 'rasterFs' }, format, true,
  );
  return { pipeline, bindGroup, vertexCount: mesh.triCount * 3, usesDepth: true };
};

/** 'plain': the baked buildings; 'waveShell': thin shells cut by the height waves in the SDF itself. */
export type SdfShape = 'plain' | 'waveShell';

export const createSdfRenderer = async (
  device: GPUDevice,
  format: GPUTextureFormat,
  frame: FrameResources,
  scene: SceneResources,
  shape: SdfShape = 'plain',
): Promise<SurfaceRenderer> => {
  const bindings: DeclaredBinding[] = [...frameBindings(frame), ...sceneBindings(scene, 2)];
  const shader = shape === 'waveShell' ? sdfWaveShellRenderShader : sdfRenderShader;
  const { pipeline, bindGroup } = await buildPipeline(
    device, `sdf-${shape}`, bindings, linkWgsl(shader), { vs: 'fullscreenVs', fs: 'sdfFs' }, format, false,
  );
  return { pipeline, bindGroup, vertexCount: 3, usesDepth: false };
};

/** SDF ray marcher over a streamed (tiled) area. */
export const createTiledSdfRenderer = async (
  device: GPUDevice,
  format: GPUTextureFormat,
  frame: FrameResources,
  scene: TiledSceneResources,
  shape: SdfShape = 'plain',
): Promise<SurfaceRenderer> => {
  const bindings: DeclaredBinding[] = [...frameBindings(frame), ...tiledSceneBindings(scene, 2)];
  const shader = shape === 'waveShell' ? sdfTiledWaveShellRenderShader : sdfTiledRenderShader;
  const { pipeline, bindGroup } = await buildPipeline(
    device, `sdf-tiled-${shape}`, bindings, linkWgsl(shader), { vs: 'fullscreenVs', fs: 'sdfFs' }, format, false,
  );
  return { pipeline, bindGroup, vertexCount: 3, usesDepth: false };
};

export type RenderTargets = { readonly id: GPUTexture; readonly depth: GPUTexture; readonly width: number; readonly height: number };

export const createRenderTargets = (device: GPUDevice, width: number, height: number): RenderTargets => ({
  id: device.createTexture({
    label: 'id-target',
    size: [width, height],
    format: ID_FORMAT,
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
  }),
  depth: device.createTexture({ label: 'depth', size: [width, height], format: DEPTH_FORMAT, usage: GPUTextureUsage.RENDER_ATTACHMENT }),
  width,
  height,
});

export const destroyRenderTargets = (t: RenderTargets): void => {
  t.id.destroy();
  t.depth.destroy();
};

export const encodeSurfacePass = (
  encoder: GPUCommandEncoder,
  renderer: SurfaceRenderer,
  colorView: GPUTextureView,
  targets: RenderTargets,
): void => {
  const pass = encoder.beginRenderPass({
    colorAttachments: [
      { view: colorView, clearValue: [0, 0, 0, 0], loadOp: 'clear', storeOp: 'store' },
      { view: targets.id.createView(), clearValue: [0, 0, 0, 0], loadOp: 'clear', storeOp: 'store' },
    ],
    depthStencilAttachment: renderer.usesDepth
      ? { view: targets.depth.createView(), depthClearValue: 1, depthLoadOp: 'clear', depthStoreOp: 'discard' }
      : undefined,
  });
  pass.setPipeline(renderer.pipeline);
  pass.setBindGroup(0, renderer.bindGroup);
  pass.draw(renderer.vertexCount);
  pass.end();
};

/** Reads the whole id target (row-padded) and returns a tightly packed Uint32Array. */
export const readIdTexture = async (device: GPUDevice, targets: RenderTargets): Promise<Uint32Array> => {
  const bytesPerRow = Math.ceil((targets.width * 4) / 256) * 256;
  const buf = device.createBuffer({ size: bytesPerRow * targets.height, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC });
  const enc = device.createCommandEncoder();
  enc.copyTextureToBuffer({ texture: targets.id }, { buffer: buf, bytesPerRow }, [targets.width, targets.height]);
  device.queue.submit([enc.finish()]);
  const raw = new Uint32Array(await readBuffer(device, buf, buf.size));
  buf.destroy();
  const out = new Uint32Array(targets.width * targets.height);
  const stride = bytesPerRow / 4;
  for (let y = 0; y < targets.height; y++) out.set(raw.subarray(y * stride, y * stride + targets.width), y * targets.width);
  return out;
};

/** Reads one id texel (for picking). Returns building index + 1, or 0. */
export const readIdAt = async (device: GPUDevice, targets: RenderTargets, x: number, y: number): Promise<number> => {
  const xi = Math.min(targets.width - 1, Math.max(0, Math.floor(x)));
  const yi = Math.min(targets.height - 1, Math.max(0, Math.floor(y)));
  const buf = device.createBuffer({ size: 256, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC });
  const enc = device.createCommandEncoder();
  enc.copyTextureToBuffer({ texture: targets.id, origin: [xi, yi] }, { buffer: buf, bytesPerRow: 256 }, [1, 1]);
  device.queue.submit([enc.finish()]);
  const v = new Uint32Array(await readBuffer(device, buf, 4))[0];
  buf.destroy();
  return v;
};
