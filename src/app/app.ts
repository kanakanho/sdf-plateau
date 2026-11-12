/**
 * Application wiring (side effects only): MapLibre map, WebGPU overlay, bake, UI and picking.
 * All computation lives in tested pure modules.
 */
import * as maplibregl from 'maplibre-gl';
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import { bakeAtlas } from '../bake/bakeGpu';
import { extendBelowGround } from '../bake/extendBase';
import type { PreparedBake } from '../bake/prepare';
import type { BakeWorkerRequest } from '../bake/bakeWorker';
import { type City, loadCity } from '../data/loadCity';
import { computeBounds } from '../data/meshFormat';
import { createLocalFrame, composeLocalToClip, localToLngLat, type LocalFrame } from '../geo/localFrame';
import { invert } from '../geo/mat4';
import { requestBrowserDevice } from '../gpu/device';
import { createBufferFromData } from '../gpu/buffers';
import { buildingAttributeArray, buildingTopHeights, glToWebGpuClip, packFrameParams } from '../render/frame';
import {
  type FrameResources,
  type RenderTargets,
  type SurfaceRenderer,
  createFrameResources,
  createRasterRenderer,
  createRenderTargets,
  createSdfRenderer,
  destroyRenderTargets,
  encodeSurfacePass,
  readIdAt,
} from '../render/renderers';
import { createSceneResources } from '../render/scene';
import { type BaseMap, baseMapStyle, createSyncLayer, mapAttributions } from '../map/syncLayer';
import { buildingPopupHtml } from './popup';
import { type ViewState, applyPatch, canvasSize, initialViewState, parseRefineFactor, renderFlags, sunLighting } from './viewState';
import { bindControls, bindPanelToggle, setStatus } from './controls';

const VOXEL_SIZE = 1;
const MAX_STEPS = 256;
/** how far building bases are pushed below z = 0 for the bake (meters) */
const BASE_EXTENSION = 3 * VOXEL_SIZE;

type Overlay = { readonly canvas: HTMLCanvasElement; readonly context: GPUCanvasContext; readonly format: GPUTextureFormat };

const createOverlay = (container: HTMLElement, device: GPUDevice): Overlay => {
  const canvas = document.createElement('canvas');
  canvas.className = 'gpu-overlay';
  container.appendChild(canvas);
  const context = canvas.getContext('webgpu');
  if (!context) throw new Error('WebGPU canvas context を取得できませんでした');
  const format = navigator.gpu.getPreferredCanvasFormat();
  context.configure({ device, format, alphaMode: 'premultiplied' });
  return { canvas, context, format };
};

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

const createMap = (container: HTMLElement, frame: LocalFrame, base: BaseMap): maplibregl.Map => {
  // MapLibre v6 resolves its worker relative to its own module; point it at the emitted asset instead.
  maplibregl.setWorkerUrl(maplibreWorkerUrl);
  return new maplibregl.Map({
    container,
    style: baseMapStyle(base),
    // MapLibre's credit plus the PLATEAU credit, visible with every base map (also the tile-less white one)
    attributionControl: { customAttribution: mapAttributions() },
    center: [frame.originLng, frame.originLat],
    zoom: 16.2,
    pitch: 60,
    bearing: -20,
    maxPitch: 85,
    canvasContextAttributes: { antialias: false },
  });
};

export const startApp = async (mapContainer: HTMLElement): Promise<void> => {
  setStatus('WebGPU を初期化しています…');
  const device = await requestBrowserDevice();
  device.lost.then((info) => setStatus(`GPU デバイスが失われました: ${info.message}`));

  setStatus('PLATEAU データを読み込んでいます…');
  const city: City = await loadCity(`${import.meta.env.BASE_URL}data`);
  const frame = createLocalFrame(city.meta.origin.lng, city.meta.origin.lat);
  const map = createMap(mapContainer, frame, 'pale');
  const overlay = createOverlay(mapContainer, device);

  const { mesh } = city;
  const attrs = buildingAttributeArray(city.meta.buildings, buildingTopHeights(mesh.positions, mesh.buildingRanges));
  const frameRes: FrameResources = createFrameResources(device, attrs);
  const tris = createBufferFromData(device, mesh.positions, GPUBufferUsage.STORAGE, 'tris');
  const triInfo = createBufferFromData(device, mesh.triInfo, GPUBufferUsage.STORAGE, 'tri-info');
  const raster = await createRasterRenderer(device, overlay.format, frameRes, { tris, triInfo, triCount: mesh.triInfo.length });

  let state: ViewState = { ...initialViewState };
  let sdf: SurfaceRenderer | null = null;
  let targets: RenderTargets | null = null;
  let lastMatrix: Float64Array | null = null;
  let frames = 0;
  let fpsT0 = performance.now();

  const ensureTargets = () => {
    const [w, h] = canvasSize(overlay.canvas.clientWidth, overlay.canvas.clientHeight, devicePixelRatio, state.renderScale);
    if (targets && targets.width === w && targets.height === h) return targets;
    if (targets) destroyRenderTargets(targets);
    overlay.canvas.width = w;
    overlay.canvas.height = h;
    targets = createRenderTargets(device, w, h);
    return targets;
  };

  const renderFrame = (mercatorToClip: Float64Array) => {
    lastMatrix = mercatorToClip;
    const t = ensureTargets();
    const localToClip = composeLocalToClip(mercatorToClip, frame);
    const inv = invert(localToClip);
    if (!inv) return;
    const sun = sunLighting(state, frame.originLat, frame.originLng);
    const renderer = state.mode === 'sdf' && sdf ? sdf : raster;
    device.queue.writeBuffer(
      frameRes.frame,
      0,
      packFrameParams({
        viewProj: glToWebGpuClip(localToClip),
        invViewProj: inv,
        sunDir: sun.dir,
        sunIntensity: sun.intensity,
        viewport: [t.width, t.height],
        time: performance.now() / 1000,
        colorMode: state.colorMode,
        flags: renderFlags(state),
        selected: state.selected,
        maxSteps: MAX_STEPS,
      }),
    );
    const encoder = device.createCommandEncoder();
    encodeSurfacePass(encoder, renderer, overlay.context.getCurrentTexture().createView(), t);
    device.queue.submit([encoder.finish()]);
    frames++;
    const now = performance.now();
    if (now - fpsT0 > 1000) {
      const label = renderer === sdf ? 'SDF' : 'ラスタ';
      document.getElementById('fps')!.textContent = `${label} ${t.width}×${t.height} ・ ${((frames * 1000) / (now - fpsT0)).toFixed(0)} fps`;
      frames = 0;
      fpsT0 = now;
    }
  };

  // The sync layer must exist in whatever style is active: 'load' may already have fired while the
  // pipelines were being created, and setStyle() (base map switch) drops custom layers.
  const addSyncLayer = () => {
    if (map.getLayer('webgpu-sync')) return;
    try {
      map.addLayer(createSyncLayer('webgpu-sync', renderFrame));
    } catch {
      // style JSON not parsed yet ("Style is not done loading"); the next styledata event retries
    }
  };
  addSyncLayer();
  map.on('load', addSyncLayer);
  map.on('styledata', addSyncLayer);
  map.on('resize', () => map.triggerRepaint());

  let popup: maplibregl.Popup | null = null;
  const update = (patch: Partial<ViewState>) => {
    state = applyPatch(state, patch);
    if (!state.picking) {
      popup?.remove();
      popup = null;
    }
    map.triggerRepaint();
  };
  bindPanelToggle();
  bindControls(
    state,
    update,
    (base) => map.setStyle(baseMapStyle(base)),
    () => map.triggerRepaint(),
    { lat: frame.originLat, lng: frame.originLng },
  );

  map.on('click', async (e: maplibregl.MapMouseEvent) => {
    if (!state.picking || !targets || !lastMatrix) return;
    const sx = targets.width / overlay.canvas.clientWidth;
    const sy = targets.height / overlay.canvas.clientHeight;
    const id = await readIdAt(device, targets, e.point.x * sx, e.point.y * sy);
    popup?.remove();
    update({ selected: id });
    if (id === 0) return;
    const b = city.meta.buildings[id - 1];
    popup = new maplibregl.Popup({ maxWidth: '320px' }).setLngLat(e.lngLat).setHTML(buildingPopupHtml(b)).addTo(map);
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
  map.triggerRepaint();

  // expose for debugging in the console
  Object.assign(window, { sdfPlateau: { map, device, city, prepared, frame, localToLngLat } });
};
