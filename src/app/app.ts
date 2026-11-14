/**
 * Station page (side effects only): Tokyo Station LOD2 baked once into a single sparse brick grid.
 * All computation lives in tested pure modules; the shared map/overlay wiring is in viewer.ts.
 */
import { bakeAtlas } from '../bake/bakeGpu';
import { extendBelowGround } from '../bake/extendBase';
import type { PreparedBake } from '../bake/prepare';
import type { BakeWorkerRequest } from '../bake/bakeWorker';
import { type City, loadCity } from '../data/loadCity';
import { computeBounds } from '../data/meshFormat';
import { createLocalFrame, localToLngLat } from '../geo/localFrame';
import { requestBrowserDevice } from '../gpu/device';
import { createBufferFromData } from '../gpu/buffers';
import { mapAttributions } from '../map/syncLayer';
import { buildingAttributeArray, buildingTopHeights } from '../render/frame';
import { type SurfaceRenderer, createFrameResources, createRasterRenderer, createSdfRenderer } from '../render/renderers';
import { createSceneResources } from '../render/scene';
import { buildingPopupHtml } from './popup';
import { parseRefineFactor } from './viewState';
import { setStatus } from './controls';
import { createOverlay, startViewer } from './viewer';

const VOXEL_SIZE = 1;
/** how far building bases are pushed below z = 0 for the bake (meters) */
const BASE_EXTENSION = 3 * VOXEL_SIZE;

const runBakeWorker = (req: BakeWorkerRequest): Promise<PreparedBake> =>
  new Promise((resolve, reject) => {
    const worker = new Worker(new URL('../bake/bakeWorker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent<PreparedBake>) => {
      resolve(e.data);
      worker.terminate();
    };
    worker.onerror = (e) => {
      reject(new Error(e.message));
      worker.terminate();
    };
    worker.postMessage(req);
  });

export const startApp = async (mapContainer: HTMLElement): Promise<void> => {
  setStatus('WebGPU を初期化しています…');
  const device = await requestBrowserDevice();
  device.lost.then((info) => setStatus(`GPU デバイスが失われました: ${info.message}`));

  setStatus('PLATEAU データを読み込んでいます…');
  const city: City = await loadCity(`${import.meta.env.BASE_URL}data`);
  const frame = createLocalFrame(city.meta.origin.lng, city.meta.origin.lat);
  const overlay = createOverlay(mapContainer, device);

  const { mesh } = city;
  const attrs = buildingAttributeArray(city.meta.buildings, buildingTopHeights(mesh.positions, mesh.buildingRanges));
  const frameRes = createFrameResources(device, attrs);
  const tris = createBufferFromData(device, mesh.positions, GPUBufferUsage.STORAGE, 'tris');
  const triInfo = createBufferFromData(device, mesh.triInfo, GPUBufferUsage.STORAGE, 'tri-info');
  const raster = await createRasterRenderer(device, overlay.format, frameRes, { tris, triInfo, triCount: mesh.triInfo.length });
  let sdf: SurfaceRenderer | null = null;

  const { map, repaint } = startViewer(mapContainer, {
    device,
    overlay,
    frame,
    attributions: mapAttributions(),
    frameRes,
    renderer: (state) => (state.mode === 'sdf' && sdf ? sdf : raster),
    label: (r) => (r === sdf ? 'SDF' : 'ラスタ'),
    describeBuilding: async (id) => buildingPopupHtml(city.meta.buildings[id - 1]),
  });

  // ---- bake (CPU binning in a worker, then GPU) ----
  setStatus('SDF ブリックを構築しています（CPU: ビン分けと適応細分化）…');
  const t0 = performance.now();
  // the SDF is baked from a copy whose bases continue below the ground (crisp wall feet)
  const bakePositions = extendBelowGround(mesh.positions, BASE_EXTENSION);
  const bakeBounds = computeBounds(bakePositions);
  const prepared = await runBakeWorker({
    positions: bakePositions.slice(),
    triInfo: mesh.triInfo.slice(),
    boundsMin: [...bakeBounds.min],
    boundsMax: [...bakeBounds.max],
    voxelSize: VOXEL_SIZE,
    refineFactor: parseRefineFactor(location.search),
  });
  const t1 = performance.now();
  const atlas = await bakeAtlas(
    device,
    {
      positions: bakePositions,
      bins: prepared.bins,
      triPaletteIndex: prepared.palettes.triPaletteIndex,
      slotDescs: prepared.slotDescs,
      spec: prepared.spec,
      layout: prepared.layout,
    },
    (done, total) =>
    setStatus(`SDF をベイクしています（GPU）… ${Math.round((done / total) * 100)}%`),
  );
  const t2 = performance.now();
  const scene = createSceneResources(device, {
    positions: bakePositions,
    triInfo: mesh.triInfo,
    bins: prepared.bins,
    spec: prepared.spec,
    layout: prepared.layout,
    atlas,
    palettes: prepared.palettes,
    brickTable: prepared.brickTable,
    refineFactor: prepared.refineFactor,
  });
  sdf = await createSdfRenderer(device, overlay.format, frameRes, scene);
  const refineLabel = prepared.refinedBricks > 0
    ? `うち ${prepared.refinedBricks.toLocaleString()} 個を ${VOXEL_SIZE / prepared.refineFactor}m に細分化, `
    : '';
  // distance (r8unorm) + id (r8uint) atlases
  const mb = (2 * prepared.layout.size[0] * prepared.layout.size[1] * prepared.layout.size[2]) / 1e6;
  setStatus(
    `建物 ${city.meta.buildings.length.toLocaleString()} 棟 ・ 三角形 ${mesh.triInfo.length.toLocaleString()} ・ ブリック ${prepared.bins.slotBricks.length.toLocaleString()}（${refineLabel}${mb.toFixed(0)} MB） ・ CPU 前処理 ${((t1 - t0) / 1000).toFixed(1)}s / GPU ベイク ${((t2 - t1) / 1000).toFixed(1)}s`,
  );
  repaint();

  // expose for debugging in the console
  Object.assign(window, { sdfPlateau: { map, device, city, prepared, frame, localToLngLat } });
};
