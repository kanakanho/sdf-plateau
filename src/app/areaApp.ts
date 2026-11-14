/**
 * Area page (side effects only): LOD1 buildings of a municipality streamed as tiles. The visible
 * tiles are fetched and prepared in workers, baked into shared GPU pools and evicted LRU.
 */
import type { GridSpec } from '../bake/gridSpec';
import { type AreaManifest, homeTileIndex, tilePath } from '../data/area';
import type { BuildingAttributes } from '../data/buildings';
import { maybeGunzip } from '../data/gzip';
import { createLocalFrame } from '../geo/localFrame';
import { requestBrowserDevice } from '../gpu/device';
import { mapAttributions, plateauAttribution } from '../map/syncLayer';
import { createFrameResources, createTiledSdfRenderer } from '../render/renderers';
import { TILE_NOT_RESIDENT, bakeTileInto, createTiledSceneResources, setTileEntry } from '../render/tiledScene';
import { viewFootprint } from '../tiles/footprint';
import type { PreparedTileData } from '../tiles/prepareTile';
import { attributeRuns, selectTiles } from '../tiles/select';
import { createStreamer } from '../tiles/streamer';
import { areaGrid, tileGridSpec } from '../tiles/tileGrid';
import type { TileWorkerRequest, TileWorkerResponse } from '../tiles/tileWorker';
import { setStatus } from './controls';
import { buildingPopupHtml } from './popup';
import { createOverlay, startViewer } from './viewer';

/** tiles further than this from the camera are not loaded [m] */
const MAX_VIEW_DISTANCE = 5000;
const WORKERS = 2;

type WorkerPool = { readonly prepare: (url: string, spec: GridSpec, baseZ: number) => Promise<PreparedTileData> };

const createWorkerPool = (size: number): WorkerPool => {
  const pending = new Map<number, { resolve: (t: PreparedTileData) => void; reject: (e: Error) => void }>();
  const workers = Array.from({ length: size }, () => {
    const w = new Worker(new URL('../tiles/tileWorker.ts', import.meta.url), { type: 'module' });
    w.onmessage = (e: MessageEvent<TileWorkerResponse>) => {
      const p = pending.get(e.data.id);
      pending.delete(e.data.id);
      if ('error' in e.data) p?.reject(new Error(e.data.error));
      else p?.resolve(e.data.tile);
    };
    return w;
  });
  let next = 0;
  return {
    prepare: (url, spec, baseZ) =>
      new Promise((resolve, reject) => {
        const id = next++;
        pending.set(id, { resolve, reject });
        workers[id % size].postMessage({ id, url, spec, baseZ } satisfies TileWorkerRequest);
      }),
  };
};

const sameKeys = (a: readonly number[], b: readonly number[]) => a.length === b.length && a.every((k, i) => k === b[i]);

export const startAreaApp = async (mapContainer: HTMLElement, slug: string): Promise<void> => {
  setStatus('WebGPU を初期化しています…');
  const device = await requestBrowserDevice();
  device.lost.then((info) => setStatus(`GPU デバイスが失われました: ${info.message}`));

  setStatus('地域データを読み込んでいます…');
  const base = `${import.meta.env.BASE_URL}data/${slug}`;
  const res = await fetch(`${base}/area.json`);
  if (!res.ok) throw new Error(`${base}/area.json を読み込めませんでした（HTTP ${res.status}）`);
  const manifest = (await res.json()) as AreaManifest;

  const frame = createLocalFrame(manifest.origin.lng, manifest.origin.lat);
  const overlay = createOverlay(mapContainer, device);
  const grid = areaGrid(manifest);
  const scene = createTiledSceneResources(device, grid);
  const frameRes = createFrameResources(device, new Float32Array(Math.max(1, manifest.buildingCount) * 4));
  const renderer = await createTiledSdfRenderer(device, overlay.format, frameRes, scene);
  const tileByKey = new Map(manifest.tiles.map((t) => [t.iy * grid.tilesX + t.ix, t]));
  const workers = createWorkerPool(WORKERS);

  // popups: home-building attributes are fetched per tile on demand
  const homeAttrs = new Map<number, Promise<BuildingAttributes[]>>();
  const describeBuilding = async (id: number): Promise<string | null> => {
    const i = homeTileIndex(manifest.tiles, id - 1);
    if (i < 0) return null;
    const t = manifest.tiles[i];
    let list = homeAttrs.get(i);
    if (!list) {
      list = fetch(`${base}/${tilePath(t.ix, t.iy, 'json.gz')}`)
        .then((r) => r.arrayBuffer())
        .then(maybeGunzip)
        .then((buf) => JSON.parse(new TextDecoder().decode(buf)) as BuildingAttributes[]);
      homeAttrs.set(i, list);
    }
    const b = (await list)[id - 1 - t.buildingStart];
    return b ? buildingPopupHtml(b) : null;
  };

  let visible: number[] = [];
  let repaint = () => {};
  const showStats = () => {
    const s = streamer.stats();
    const loaded = new Set(streamer.residentKeys());
    const shown = visible.filter((k) => loaded.has(k)).length;
    const loading = s.preparing + s.waiting;
    const mb = (rows: number) => ((rows * scene.layout.slotsX * 729 * 2) / 1e6).toFixed(0);
    setStatus(
      `${manifest.name}（LOD1） ・ 建物 ${manifest.buildingCount.toLocaleString()} 棟 ・ タイル ${shown} / ${visible.length}` +
        `${loading ? `（${loading} 読み込み中）` : ''}${s.noRoom ? ` ・ 容量不足 ${s.noRoom}` : ''}${s.failed ? ` ・ 失敗 ${s.failed}` : ''}` +
        ` ・ 保持 ${s.resident} 枚 ・ アトラス ${mb(s.rowsUsed)} / ${mb(s.rowsTotal)} MB`,
    );
  };

  const streamer = createStreamer<PreparedTileData & { slotCount: number; paletteEntries: number }>({
    pools: {
      rows: scene.slotCapacity / scene.layout.slotsX,
      rowSlots: scene.layout.slotsX,
      paletteEntries: scene.paletteCapacity,
      residents: scene.residentCapacity,
    },
    prepare: async (key) => {
      const t = tileByKey.get(key)!;
      const tile = await workers.prepare(`${base}/${tilePath(t.ix, t.iy, 'bin.gz')}`, tileGridSpec(grid, t.ix, t.iy), grid.baseZ);
      return { ...tile, slotCount: tile.bins.slotBricks.length, paletteEntries: tile.palettes.palette.length };
    },
    install: async (key, place, tile) => {
      await bakeTileInto(device, scene, place, tile);
      for (const run of attributeRuns(tile.indices, tile.attributes)) device.queue.writeBuffer(frameRes.attrs, run.start * 16, run.data);
      setTileEntry(device, scene, key, place.resident);
    },
    uninstall: (key) => setTileEntry(device, scene, key, TILE_NOT_RESIDENT),
    onChange: () => {
      showStats();
      repaint();
    },
    log: (m) => console.warn(m),
  });

  const viewer = startViewer(mapContainer, {
    device,
    overlay,
    frame,
    view: manifest.view,
    attributions: mapAttributions(plateauAttribution(manifest.attribution.name, manifest.attribution.url)),
    frameRes,
    renderer: () => renderer,
    label: () => 'SDF（タイル）',
    onView: (inv) => {
      const keys = selectTiles(manifest, viewFootprint(inv, MAX_VIEW_DISTANCE), scene.residentCapacity);
      if (sameKeys(keys, visible)) return;
      visible = keys;
      streamer.setVisible(keys);
      showStats();
    },
    describeBuilding,
  });
  repaint = viewer.repaint;
  showStats();

  // expose for debugging in the console
  Object.assign(window, { sdfPlateau: { map: viewer.map, device, manifest, grid, scene, streamer, frame } });
};
