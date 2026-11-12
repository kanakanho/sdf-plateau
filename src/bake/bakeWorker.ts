/// <reference lib="webworker" />
/** Web Worker entry: runs prepareBake off the main thread. */
import { prepareBake, transferablesOf } from './prepare';

export type BakeWorkerRequest = {
  readonly positions: Float32Array;
  readonly triInfo: Uint32Array;
  readonly boundsMin: number[];
  readonly boundsMax: number[];
  readonly voxelSize: number;
  readonly refineFactor: number;
};

self.onmessage = (e: MessageEvent<BakeWorkerRequest>) => {
  const { positions, triInfo, boundsMin, boundsMax, voxelSize, refineFactor } = e.data;
  const prepared = prepareBake(positions, triInfo, boundsMin, boundsMax, voxelSize, { refineFactor });
  (self as unknown as DedicatedWorkerGlobalScope).postMessage(prepared, transferablesOf(prepared));
};
