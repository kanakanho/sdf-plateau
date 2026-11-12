/**
 * GPU bake: computes the brick SDF samples and nearest-triangle palette indices and uploads them
 * into two 3D atlases with identical layout (distance: r8unorm, id: r8uint).
 * Work is split into runs of slot rows (128 slots each) that map to contiguous atlas regions.
 */
import { createBufferFromData, createEmptyBuffer } from '../gpu/buffers';
import { createCheckedShaderModule } from '../gpu/shader';
import { linkWgsl } from '../wgsl/link';
import { bakeKernel, packKernel } from '../wgsl/modules';
import { type AtlasLayout, SAMPLES_PER_AXIS, SAMPLES_PER_BRICK } from './atlasLayout';
import type { BrickBins } from './binning';
import type { GridSpec } from './gridSpec';
import { alignTo, dispatchSize, packBakeParams, packPackParams } from './params';

export type BakeRun = {
  readonly slotStart: number;
  readonly slotCount: number;
  /** atlas origin of the region, in texels */
  readonly origin: [number, number, number];
  readonly slotRows: number;
};

/** Splits slots into runs of whole slot rows that never cross an atlas z-layer. */
export const planBakeRuns = (slotCount: number, layout: AtlasLayout, maxRowsPerRun = 16): BakeRun[] => {
  const runs: BakeRun[] = [];
  const totalRows = Math.ceil(slotCount / layout.slotsX);
  let row = 0;
  while (row < totalRows) {
    const layer = Math.floor(row / layout.slotsY);
    const rowInLayer = row % layout.slotsY;
    const rows = Math.min(maxRowsPerRun, layout.slotsY - rowInLayer, totalRows - row);
    const slotStart = row * layout.slotsX;
    runs.push({
      slotStart,
      slotCount: Math.min(rows * layout.slotsX, slotCount - slotStart),
      origin: [0, rowInLayer * SAMPLES_PER_AXIS, layer * SAMPLES_PER_AXIS],
      slotRows: rows,
    });
    row += rows;
  }
  return runs;
};

export type BakeInput = {
  readonly positions: Float32Array;
  readonly bins: BrickBins;
  /** palette index per entry of bins.triIndices (see buildSlotPalettes) */
  readonly triPaletteIndex: Uint32Array;
  /** per slot: min corner xyz and voxel size */
  readonly slotDescs: Float32Array;
  readonly spec: GridSpec;
  readonly layout: AtlasLayout;
};

export type BakedAtlas = { readonly distance: GPUTexture; readonly id: GPUTexture };

export const createAtlasTexture = (device: GPUDevice, layout: AtlasLayout, format: 'r8unorm' | 'r8uint' = 'r8unorm'): GPUTexture =>
  device.createTexture({
    label: format === 'r8unorm' ? 'sdf-atlas' : 'id-atlas',
    size: layout.size,
    dimension: '3d',
    format,
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.COPY_SRC,
  });

export const bakeAtlas = async (
  device: GPUDevice,
  input: BakeInput,
  onProgress?: (done: number, total: number) => void,
): Promise<BakedAtlas> => {
  const { positions, bins, spec, layout } = input;
  const slotCount = bins.slotBricks.length;
  const atlas: BakedAtlas = { distance: createAtlasTexture(device, layout), id: createAtlasTexture(device, layout, 'r8uint') };
  if (slotCount === 0) return atlas;

  const [bakeModule, packModule] = await Promise.all([
    createCheckedShaderModule(device, linkWgsl(bakeKernel), 'bake'),
    createCheckedShaderModule(device, linkWgsl(packKernel), 'pack'),
  ]);
  const bakePipeline = device.createComputePipeline({ layout: 'auto', compute: { module: bakeModule, entryPoint: 'bakeMain' } });
  const packPipeline = device.createComputePipeline({ layout: 'auto', compute: { module: packModule, entryPoint: 'packMain' } });

  const S = GPUBufferUsage.STORAGE;
  const trisBuf = createBufferFromData(device, positions, S, 'bake-tris');
  const descBuf = createBufferFromData(device, input.slotDescs, S, 'bake-slot-descs');
  const offsetsBuf = createBufferFromData(device, bins.triOffsets, S, 'bake-tri-offsets');
  const indicesBuf = createBufferFromData(device, bins.triIndices, S, 'bake-tri-indices');
  const paletteIdxBuf = createBufferFromData(device, input.triPaletteIndex, S, 'bake-tri-palette');

  const runs = planBakeRuns(slotCount, layout);
  const maxRunSlots = Math.max(...runs.map((r) => r.slotCount));
  const width = layout.size[0];
  const bytesPerRow = alignTo(width, 256);
  const maxRows = Math.max(...runs.map((r) => r.slotRows)) * SAMPLES_PER_AXIS;
  const distBuf = createEmptyBuffer(device, maxRunSlots * SAMPLES_PER_BRICK * 4, S, 'bake-distances');
  const idBuf = createEmptyBuffer(device, maxRunSlots * SAMPLES_PER_BRICK * 4, S, 'bake-ids');
  const packedSize = bytesPerRow * maxRows * SAMPLES_PER_AXIS;
  const packBufs = [0, 1].map((m) => createEmptyBuffer(device, packedSize, S | GPUBufferUsage.COPY_SRC, `bake-packed-${m}`));
  const U = GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST;

  let done = 0;
  for (const run of runs) {
    const [bx, by] = dispatchSize(run.slotCount * SAMPLES_PER_BRICK);
    const bakeParams = createBufferFromData(device, new Uint8Array(packBakeParams(spec.truncation / spec.voxelSize, run.slotStart, run.slotCount, bx)), U);
    const rows = run.slotRows * SAMPLES_PER_AXIS;
    const region = { width, rows, bytesPerRow, slotCount: run.slotCount };
    const words = (bytesPerRow / 4) * rows * SAMPLES_PER_AXIS;
    const [px, py] = dispatchSize(words);
    const packParams = ([0, 1] as const).map((mode) =>
      createBufferFromData(device, // distances are already normalised to [-1, 1] by the bake pass
      new Uint8Array(packPackParams(region, 1, layout.slotsX, px, mode)), U),
    );

    const encoder = device.createCommandEncoder({ label: 'bake-run' });
    const bakePass = encoder.beginComputePass();
    bakePass.setPipeline(bakePipeline);
    bakePass.setBindGroup(
      0,
      device.createBindGroup({
        layout: bakePipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: bakeParams } },
          { binding: 1, resource: { buffer: trisBuf } },
          { binding: 2, resource: { buffer: descBuf } },
          { binding: 3, resource: { buffer: offsetsBuf } },
          { binding: 4, resource: { buffer: indicesBuf } },
          { binding: 5, resource: { buffer: distBuf } },
          { binding: 6, resource: { buffer: paletteIdxBuf } },
          { binding: 7, resource: { buffer: idBuf } },
        ],
      }),
    );
    bakePass.dispatchWorkgroups(bx, by);
    bakePass.end();
    const textures = [atlas.distance, atlas.id];
    for (const mode of [0, 1]) {
      const packPass = encoder.beginComputePass();
      packPass.setPipeline(packPipeline);
      packPass.setBindGroup(
        0,
        device.createBindGroup({
          layout: packPipeline.getBindGroupLayout(0),
          entries: [
            { binding: 0, resource: { buffer: packParams[mode] } },
            { binding: 1, resource: { buffer: distBuf } },
            { binding: 2, resource: { buffer: packBufs[mode] } },
            { binding: 3, resource: { buffer: idBuf } },
          ],
        }),
      );
      packPass.dispatchWorkgroups(px, py);
      packPass.end();
      encoder.copyBufferToTexture(
        { buffer: packBufs[mode], bytesPerRow, rowsPerImage: rows },
        { texture: textures[mode], origin: run.origin },
        [width, rows, SAMPLES_PER_AXIS],
      );
    }
    device.queue.submit([encoder.finish()]);
    await device.queue.onSubmittedWorkDone();
    bakeParams.destroy();
    for (const b of packParams) b.destroy();
    done += run.slotCount;
    onProgress?.(done, slotCount);
  }
  for (const b of [trisBuf, descBuf, offsetsBuf, indicesBuf, paletteIdxBuf, distBuf, idBuf, ...packBufs]) b.destroy();
  return atlas;
};
