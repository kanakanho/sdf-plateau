/// <reference lib="webworker" />
/** Web Worker entry: fetches a tile file and prepares it for the GPU bake. */
import type { GridSpec } from '../bake/gridSpec';
import { maybeGunzip } from '../data/gzip';
import { type PreparedTileData, prepareTile, preparedTileTransferables } from './prepareTile';

export type TileWorkerRequest = { readonly id: number; readonly url: string; readonly spec: GridSpec; readonly baseZ: number };
export type TileWorkerResponse =
  | { readonly id: number; readonly tile: PreparedTileData }
  | { readonly id: number; readonly error: string };

const scope = self as unknown as DedicatedWorkerGlobalScope;

scope.onmessage = async (e: MessageEvent<TileWorkerRequest>) => {
  const { id, url, spec, baseZ } = e.data;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
    const tile = prepareTile(await maybeGunzip(await res.arrayBuffer()), spec, baseZ);
    scope.postMessage({ id, tile } satisfies TileWorkerResponse, preparedTileTransferables(tile));
  } catch (err) {
    scope.postMessage({ id, error: err instanceof Error ? err.message : String(err) } satisfies TileWorkerResponse);
  }
};
