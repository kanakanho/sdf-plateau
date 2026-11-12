/** Thin, stateless helpers around GPUBuffer creation and readback. */

const align4 = (n: number): number => Math.ceil(n / 4) * 4;

export const createBufferFromData = (
  device: GPUDevice,
  data: ArrayBufferView,
  usage: GPUBufferUsageFlags,
  label?: string,
): GPUBuffer => {
  const size = Math.max(16, align4(data.byteLength));
  const buffer = device.createBuffer({ size, usage, mappedAtCreation: true, label });
  new Uint8Array(buffer.getMappedRange()).set(
    new Uint8Array(data.buffer, data.byteOffset, data.byteLength),
  );
  buffer.unmap();
  return buffer;
};

export const createEmptyBuffer = (
  device: GPUDevice,
  byteLength: number,
  usage: GPUBufferUsageFlags,
  label?: string,
): GPUBuffer => device.createBuffer({ size: Math.max(16, align4(byteLength)), usage, label });

/** Copies `byteLength` bytes of `source` (needs COPY_SRC) into a staging buffer and returns them. */
export const readBuffer = async (
  device: GPUDevice,
  source: GPUBuffer,
  byteLength: number,
  sourceOffset = 0,
): Promise<ArrayBuffer> => {
  const size = align4(byteLength);
  const staging = device.createBuffer({
    size,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
  });
  const encoder = device.createCommandEncoder();
  encoder.copyBufferToBuffer(source, sourceOffset, staging, 0, size);
  device.queue.submit([encoder.finish()]);
  await staging.mapAsync(GPUMapMode.READ);
  const copy = staging.getMappedRange().slice(0, byteLength);
  staging.unmap();
  staging.destroy();
  return copy;
};
