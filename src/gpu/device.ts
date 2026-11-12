/** Browser WebGPU device acquisition. */
export const requestBrowserDevice = async (gpu: GPU | undefined = navigator.gpu): Promise<GPUDevice> => {
  if (!gpu) throw new Error('このブラウザは WebGPU に対応していません');
  const adapter = await gpu.requestAdapter({ powerPreference: 'high-performance' });
  if (!adapter) throw new Error('WebGPU アダプタを取得できませんでした');
  return adapter.requestDevice({
    requiredLimits: {
      maxStorageBufferBindingSize: adapter.limits.maxStorageBufferBindingSize,
      maxBufferSize: adapter.limits.maxBufferSize,
    },
  });
};
