/**
 * GPU resources describing the baked scene, plus the matching WGSL declarations so that
 * render pipelines and unit tests bind exactly the same layout.
 */
import type { AtlasLayout } from '../bake/atlasLayout';
import type { BakedAtlas } from '../bake/bakeGpu';
import type { BrickBins } from '../bake/binning';
import type { GridSpec } from '../bake/gridSpec';
import { buildIndirection } from '../bake/indirection';
import { packSceneParams } from '../bake/params';
import { type SlotPalettes, packPaletteTable } from '../bake/palette';
import type { DeclaredBinding } from '../gpu/bindings';
import { createBufferFromData } from '../gpu/buffers';

export type SceneResources = {
  readonly params: GPUBuffer;
  readonly brickTable: GPUBuffer;
  readonly tris: GPUBuffer;
  readonly triInfo: GPUBuffer;
  readonly slotTriOffsets: GPUBuffer;
  readonly slotTriIndices: GPUBuffer;
  readonly atlasView: GPUTextureView;
  readonly idAtlasView: GPUTextureView;
  readonly slotPalettes: GPUBuffer;
  readonly sampler: GPUSampler;
  readonly spec: GridSpec;
  readonly layout: AtlasLayout;
  readonly triCount: number;
};

export type SceneInput = {
  readonly positions: Float32Array;
  readonly triInfo: Uint32Array;
  readonly bins: BrickBins;
  readonly spec: GridSpec;
  readonly layout: AtlasLayout;
  readonly atlas: BakedAtlas;
  readonly palettes: SlotPalettes;
  readonly brickTable?: Uint32Array;
  /** children per axis of refined bricks (1 = no refinement) */
  readonly refineFactor?: number;
};

export const createSceneResources = (device: GPUDevice, input: SceneInput): SceneResources => {
  const S = GPUBufferUsage.STORAGE;
  const triCount = input.triInfo.length;
  return {
    params: createBufferFromData(
      device,
      new Uint8Array(packSceneParams(input.spec, input.layout, input.refineFactor ?? 1, input.bins.slotBricks.length)),
      GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      'scene-params',
    ),
    brickTable: createBufferFromData(device, input.brickTable ?? buildIndirection(input.spec, input.bins.slotBricks), S, 'brick-table'),
    tris: createBufferFromData(device, input.positions, S, 'scene-tris'),
    triInfo: createBufferFromData(device, input.triInfo, S, 'scene-tri-info'),
    slotTriOffsets: createBufferFromData(device, input.bins.triOffsets, S, 'slot-tri-offsets'),
    slotTriIndices: createBufferFromData(device, input.bins.triIndices, S, 'slot-tri-indices'),
    atlasView: input.atlas.distance.createView({ dimension: '3d' }),
    idAtlasView: input.atlas.id.createView({ dimension: '3d' }),
    slotPalettes: createBufferFromData(device, packPaletteTable(input.palettes), S, 'slot-palettes'),
    sampler: device.createSampler({ magFilter: 'linear', minFilter: 'linear', addressModeU: 'clamp-to-edge', addressModeV: 'clamp-to-edge', addressModeW: 'clamp-to-edge' }),
    spec: input.spec,
    layout: input.layout,
    triCount,
  };
};

export type SceneBinding = DeclaredBinding;

/** Bindings for sdfScene.wgsl starting at `first` (10 consecutive binding slots). */
export const sceneBindings = (scene: SceneResources, first: number): SceneBinding[] => [
  { binding: first, decl: 'var<uniform> scene: SceneParams;', resource: { buffer: scene.params } },
  { binding: first + 1, decl: 'var<storage, read> brickTable: array<u32>;', resource: { buffer: scene.brickTable } },
  { binding: first + 2, decl: 'var sdfAtlas: texture_3d<f32>;', resource: scene.atlasView },
  { binding: first + 3, decl: 'var sdfSampler: sampler;', resource: scene.sampler },
  { binding: first + 4, decl: 'var<storage, read> sceneTris: array<f32>;', resource: { buffer: scene.tris } },
  { binding: first + 5, decl: 'var<storage, read> sceneTriInfo: array<u32>;', resource: { buffer: scene.triInfo } },
  { binding: first + 6, decl: 'var<storage, read> slotTriOffsets: array<u32>;', resource: { buffer: scene.slotTriOffsets } },
  { binding: first + 7, decl: 'var<storage, read> slotTriIndices: array<u32>;', resource: { buffer: scene.slotTriIndices } },
  { binding: first + 8, decl: 'var idAtlas: texture_3d<u32>;', resource: scene.idAtlasView },
  { binding: first + 9, decl: 'var<storage, read> slotPalettes: array<u32>;', resource: { buffer: scene.slotPalettes } },
];

export const destroySceneResources = (scene: SceneResources): void => {
  for (const b of [scene.params, scene.brickTable, scene.tris, scene.triInfo, scene.slotTriOffsets, scene.slotTriIndices, scene.slotPalettes]) b.destroy();
};
