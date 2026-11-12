/** Shader module creation with compile-error surfacing. */

export const formatCompilationMessages = (
  messages: readonly Pick<GPUCompilationMessage, 'type' | 'lineNum' | 'linePos' | 'message'>[],
): string =>
  messages
    .filter((m) => m.type === 'error')
    .map((m) => `${m.lineNum}:${m.linePos} ${m.message}`)
    .join('\n');

/** Creates a shader module and rejects with readable messages if it fails to compile. */
export const createCheckedShaderModule = async (
  device: GPUDevice,
  code: string,
  label?: string,
): Promise<GPUShaderModule> => {
  device.pushErrorScope('validation');
  const module = device.createShaderModule({ code, label });
  const info = await module.getCompilationInfo();
  const scopeError = await device.popErrorScope();
  const errors = formatCompilationMessages(info.messages) || scopeError?.message;
  if (errors) throw new Error(`WGSL compile error${label ? ` in ${label}` : ''}:\n${errors}`);
  return module;
};

/** Runs `fn` inside a validation error scope and throws if anything was reported. */
export const withValidation = async <T>(device: GPUDevice, fn: () => T | Promise<T>): Promise<T> => {
  device.pushErrorScope('validation');
  const result = await fn();
  const error = await device.popErrorScope();
  if (error) throw new Error(`WebGPU validation error: ${error.message}`);
  return result;
};
