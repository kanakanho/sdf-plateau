/**
 * Viewer wiring shared by the station (single bake) and area (streamed tiles) pages: MapLibre map,
 * WebGPU overlay, frame loop synchronised with the map, control panel and picking. Side effects only.
 */
import * as maplibregl from 'maplibre-gl';
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import { composeLocalToClip, type LocalFrame } from '../geo/localFrame';
import { invert, type Mat4 } from '../geo/mat4';
import { type BaseMap, baseMapStyle, createSyncLayer } from '../map/syncLayer';
import { glToWebGpuClip, packFrameParams } from '../render/frame';
import {
  type FrameResources,
  type RenderTargets,
  type SurfaceRenderer,
  createRenderTargets,
  destroyRenderTargets,
  encodeSurfacePass,
  readIdAt,
} from '../render/renderers';
import { bindControls, bindPanelToggle } from './controls';
import { type ViewState, applyPatch, canvasSize, initialViewState, isAnimated, renderFlags, sunLighting } from './viewState';

const MAX_STEPS = 256;

export type CameraView = { readonly zoom: number; readonly pitch: number; readonly bearing: number };
export const DEFAULT_VIEW: CameraView = { zoom: 16.2, pitch: 60, bearing: -20 };

type Overlay = { readonly canvas: HTMLCanvasElement; readonly context: GPUCanvasContext; readonly format: GPUTextureFormat };

export const createOverlay = (container: HTMLElement, device: GPUDevice): Overlay => {
  const canvas = document.createElement('canvas');
  canvas.className = 'gpu-overlay';
  container.appendChild(canvas);
  const context = canvas.getContext('webgpu');
  if (!context) throw new Error('WebGPU canvas context を取得できませんでした');
  const format = navigator.gpu.getPreferredCanvasFormat();
  context.configure({ device, format, alphaMode: 'premultiplied' });
  return { canvas, context, format };
};

const createMap = (container: HTMLElement, frame: LocalFrame, view: CameraView, attributions: string[]): maplibregl.Map => {
  // MapLibre v6 resolves its worker relative to its own module; point it at the emitted asset instead.
  maplibregl.setWorkerUrl(maplibreWorkerUrl);
  return new maplibregl.Map({
    container,
    style: baseMapStyle('pale'),
    // MapLibre's credit plus the PLATEAU credit, visible with every base map (also the tile-less white one)
    attributionControl: { customAttribution: attributions },
    center: [frame.originLng, frame.originLat],
    zoom: view.zoom,
    pitch: view.pitch,
    bearing: view.bearing,
    maxPitch: 85,
    canvasContextAttributes: { antialias: false },
  });
};

export type ViewerOptions = {
  readonly device: GPUDevice;
  readonly overlay: Overlay;
  readonly frame: LocalFrame;
  readonly view?: CameraView;
  readonly attributions: string[];
  readonly frameRes: FrameResources;
  /** renderer for the current state (null: draw nothing yet) */
  readonly renderer: (state: ViewState) => SurfaceRenderer | null;
  /** fps label of a renderer */
  readonly label: (renderer: SurfaceRenderer) => string;
  /** called every frame with the inverse local -> GL clip matrix (e.g. to pick tiles) */
  readonly onView?: (invLocalToClip: Mat4) => void;
  /** overrides of the initial UI state (e.g. the colour mode of a page) */
  readonly initialState?: Partial<ViewState>;
  /** repaint every frame regardless of the colour mode (the scene itself moves) */
  readonly animate?: boolean;
  /** popup HTML for a picked building (index + 1), or null */
  readonly describeBuilding: (id: number) => Promise<string | null>;
};

export type Viewer = { readonly map: maplibregl.Map; readonly repaint: () => void };

export const startViewer = (container: HTMLElement, o: ViewerOptions): Viewer => {
  const { device, overlay, frame, frameRes } = o;
  const map = createMap(container, frame, o.view ?? DEFAULT_VIEW, o.attributions);

  let state: ViewState = { ...initialViewState, ...o.initialState };
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
    o.onView?.(inv);
    const renderer = o.renderer(state);
    if (!renderer) return;
    const sun = sunLighting(state, frame.originLat, frame.originLng);
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
    if (o.animate || isAnimated(state)) map.triggerRepaint();
    frames++;
    const now = performance.now();
    if (now - fpsT0 > 1000) {
      document.getElementById('fps')!.textContent = `${o.label(renderer)} ${t.width}×${t.height} ・ ${((frames * 1000) / (now - fpsT0)).toFixed(0)} fps`;
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
    (base: BaseMap) => map.setStyle(baseMapStyle(base)),
    () => map.triggerRepaint(),
    { lat: frame.originLat, lng: frame.originLng },
  );

  map.on('click', async (e: maplibregl.MapMouseEvent) => {
    if (!state.picking || !targets || !lastMatrix) return;
    const sx = targets.width / overlay.canvas.clientWidth;
    const sy = targets.height / overlay.canvas.clientHeight;
    const id = await readIdAt(device, targets, e.point.x * sx, e.point.y * sy);
    popup?.remove();
    popup = null;
    update({ selected: id });
    if (id === 0) return;
    const html = await o.describeBuilding(id);
    if (html === null || state.selected !== id) return;
    popup = new maplibregl.Popup({ maxWidth: '320px' }).setLngLat(e.lngLat).setHTML(html).addTo(map);
  });

  return { map, repaint: () => map.triggerRepaint() };
};
