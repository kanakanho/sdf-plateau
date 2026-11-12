import { describe, expect, it } from 'vitest';
import { requestBrowserDevice } from './device';

describe('requestBrowserDevice', () => {
  it('rejects when WebGPU is unavailable', async () => {
    await expect(requestBrowserDevice(undefined)).rejects.toThrow(/WebGPU/);
  });
  it('rejects when no adapter is returned', async () => {
    const gpu = { requestAdapter: async () => null } as unknown as GPU;
    await expect(requestBrowserDevice(gpu)).rejects.toThrow(/アダプタ/);
  });
  it('requests the adapter maximum buffer limits', async () => {
    let limits: Record<string, number> | undefined;
    const adapter = {
      limits: { maxStorageBufferBindingSize: 1 << 30, maxBufferSize: 1 << 31 },
      requestDevice: async (d: GPUDeviceDescriptor) => {
        limits = d.requiredLimits as Record<string, number>;
        return {} as GPUDevice;
      },
    };
    await requestBrowserDevice({ requestAdapter: async () => adapter } as unknown as GPU);
    expect(limits).toEqual({ maxStorageBufferBindingSize: 1 << 30, maxBufferSize: 1 << 31 });
  });
});
