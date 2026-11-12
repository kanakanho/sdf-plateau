/**
 * Node-only: obtains a GPUDevice via Dawn (npm `webgpu`) for unit tests.
 * Never import this from browser code.
 */
import { create, globals } from 'webgpu';

// The object returned by create() must stay referenced while any device is alive;
// if it is garbage-collected Dawn crashes (see npm `webgpu` README, "Lifetime").
let gpuInstance: GPU | null = null;
let devicePromise: Promise<GPUDevice> | null = null;

export const getTestDevice = (): Promise<GPUDevice> => {
  if (!devicePromise) {
    Object.assign(globalThis, globals);
    gpuInstance = create([]);
    devicePromise = gpuInstance
      .requestAdapter()
      .then((adapter) => {
        if (!adapter) throw new Error('No WebGPU adapter available (Dawn)');
        return adapter.requestDevice({
          requiredLimits: {
            maxStorageBufferBindingSize: adapter.limits.maxStorageBufferBindingSize,
            maxBufferSize: adapter.limits.maxBufferSize,
          },
        });
      })
      .then((device) => {
        device.addEventListener('uncapturederror', (e) => {
          console.error('WebGPU uncaptured error:', (e as GPUUncapturedErrorEvent).error.message);
        });
        return device;
      });
  }
  return devicePromise;
};

/**
 * Destroys the shared device and drops the Dawn instance so the worker can exit cleanly.
 */
export const releaseTestDevice = async (): Promise<void> => {
  if (!devicePromise) return;
  const device = await devicePromise;
  devicePromise = null;
  await device.queue.onSubmittedWorkDone();
  device.destroy();
  await new Promise((r) => setTimeout(r, 50));
  gpuInstance = null;
};
