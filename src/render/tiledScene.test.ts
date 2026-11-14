/**
 * Tiled scene: two tiles baked independently into shared pools must behave like one grid,
 * including across the tile boundary, and unloaded tiles must read as empty space.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { bakeAtlas } from '../bake/bakeGpu';
import { prepareBake, prepareBakeOnGrid } from '../bake/prepare';
import { packTriInfo } from '../data/meshFormat';
import { invert, lookAt, multiply, perspectiveGl } from '../geo/mat4';
import { boxTriangles } from '../geom/boxMesh';
import { evalWgsl } from '../gpu/harness';
import { getTestDevice } from '../gpu/testDevice';
import { areaGrid, tileGridSpec, tileTableIndex } from '../tiles/tileGrid';
import { linkWgsl } from '../wgsl/link';
import { sdfTiledScene } from '../wgsl/modules';
import { compareIdImages } from './compare';
import { ColorMode, glToWebGpuClip, packFrameParams } from './frame';
import {
  type FrameResources,
  type SurfaceRenderer,
  createFrameResources,
  createRenderTargets,
  createSdfRenderer,
  createTiledSdfRenderer,
  encodeSurfacePass,
  readIdTexture,
} from './renderers';
import { createSceneResources } from './scene';
import {
  PALETTE_ENTRIES_PER_SLOT,
  TILE_NOT_RESIDENT,
  type TiledSceneResources,
  bakeTileInto,
  budgetAtlasLayout,
  createTiledSceneResources,
  setTileEntry,
  tiledSceneBindings,
} from './tiledScene';

// 1 m voxels, 16 m tiles (2 bricks), 2 x 1 tiles; one box straddles the boundary x = 16
const manifest = {
  voxelSize: 1,
  tileSize: 16,
  grid: { originX: 0, originY: 0, nx: 2, ny: 1 },
  tiles: [
    { ix: 0, iy: 0, buildingStart: 0, count: 1, maxZ: 10 },
    { ix: 1, iy: 0, buildingStart: 1, count: 0, maxZ: 10 },
  ],
};
const grid = areaGrid(manifest);
const boxMin = [9, 4, grid.baseZ];
const boxMax = [23, 12, 10];
const positions = boxTriangles(boxMin as [number, number, number], boxMax as [number, number, number]);
const triInfo = new Uint32Array(positions.length / 9).fill(packTriInfo(0, 1));
const sdBoxCpu = (p: readonly number[]): number => {
  const q = [0, 1, 2].map((k) => Math.abs(p[k] - (boxMin[k] + boxMax[k]) / 2) - (boxMax[k] - boxMin[k]) / 2);
  const out = Math.hypot(...q.map((v) => Math.max(v, 0)));
  return out + Math.min(Math.max(q[0], q[1], q[2]), 0);
};

const loadTiles = async (device: GPUDevice, scene: TiledSceneResources) => {
  let slotBase = 0;
  let paletteStart = 0;
  for (const [resident, ix] of [0, 1].entries()) {
    const spec = tileGridSpec(grid, ix, 0);
    const p = prepareBakeOnGrid(positions, triInfo, spec, { refineFactor: 1 });
    await bakeTileInto(device, scene, { resident, slotBase, paletteStart }, { positions, ...p });
    setTileEntry(device, scene, tileTableIndex(grid, ix, 0), resident);
    slotBase += Math.ceil(p.bins.slotBricks.length / scene.layout.slotsX) * scene.layout.slotsX;
    paletteStart += p.palettes.palette.length;
  }
};

describe('budgetAtlasLayout', () => {
  it('turns a byte budget into whole slot rows', () => {
    const { layout, slotCapacity } = budgetAtlasLayout(10 * 1024 * 1024);
    expect(layout.slotsX).toBe(128);
    expect(slotCapacity % 128).toBe(0);
    expect(slotCapacity).toBeGreaterThanOrEqual(Math.floor((10 * 1024 * 1024) / 1458));
  });
});

describe('createTiledSceneResources', () => {
  it('sizes the palette pool from the atlas capacity unless given', async () => {
    const device = await getTestDevice();
    const a = createTiledSceneResources(device, grid, { atlasBytes: 1 << 20, residentTiles: 2 });
    expect(a.paletteCapacity).toBe(a.slotCapacity * PALETTE_ENTRIES_PER_SLOT);
    expect(a.slotPalettes.size).toBe((a.slotCapacity + a.paletteCapacity) * 4);
    const b = createTiledSceneResources(device, grid, { atlasBytes: 1 << 20, residentTiles: 2, paletteEntries: 64 });
    expect(b.paletteCapacity).toBe(64);
  });
});

describe('tiledSceneBindings', () => {
  it('exposes 8 consecutive bindings matching sdfTiledScene.wgsl names', async () => {
    const scene = createTiledSceneResources(await getTestDevice(), grid, { atlasBytes: 1 << 20, residentTiles: 2, paletteEntries: 64 });
    const b = tiledSceneBindings(scene, 2);
    expect(b.map((x) => x.binding)).toEqual([2, 3, 4, 5, 6, 7, 8, 9]);
    expect(b.map((x) => /var(?:<[^>]+>)?\s+(\w+)/.exec(x.decl)![1])).toEqual([
      'scene', 'tiling', 'tileTable', 'brickTable', 'sdfAtlas', 'sdfSampler', 'idAtlas', 'slotPalettes',
    ]);
  });
});

describe('tileEdgeBricks (WGSL)', () => {
  it('counts bricks to the nearest tile edge', async () => {
    const out = await evalWgsl(await getTestDevice(), {
      prelude: 'const BRICK_EMPTY_FLAG: u32 = 0x80000000u;\n' + /fn tileEdgeBricks[\s\S]*?\n}\n/.exec(sdfTiledScene.code)![0],
      body: 'return vec4f(f32(tileEdgeBricks(vec2i(i32(v.x), i32(v.y)), 8)));',
      inputs: [[0, 4], [3, 3], [7, 2], [4, 5], [2, 7]],
    });
    expect(out.map((r) => r[0])).toEqual([0, 3, 0, 2, 0]);
  });
});

describe('tiled scene queries', () => {
  let scene: TiledSceneResources;
  beforeAll(async () => {
    const device = await getTestDevice();
    scene = createTiledSceneResources(device, grid, { atlasBytes: 1 << 20, residentTiles: 2, paletteEntries: 4096 });
    await loadTiles(device, scene);
  });

  const query = async (pts: number[][]) =>
    evalWgsl(await getTestDevice(), {
      prelude: linkWgsl(sdfTiledScene),
      body: 'return vec4f(sceneDistanceInfo(v.xyz), f32(locateCell(v.xyz).skip), 0.0);',
      inputs: pts,
      extra: tiledSceneBindings(scene, 2),
    });

  it('reproduces the box SDF on both sides of the tile boundary', async () => {
    const pts: number[][] = [];
    for (const x of [8.4, 10, 14, 15.6, 16.4, 18, 22, 23.6]) for (const z of [2, 9.5, 10.4]) pts.push([x, 8, z], [x, 3.4, z]);
    const near = pts.filter((p) => Math.abs(sdBoxCpu(p)) < 0.9);
    expect(near.length).toBeGreaterThan(10);
    const out = await query(near);
    near.forEach((p, i) => {
      expect(out[i][1]).toBe(1);
      // trilinear interpolation is exact on faces and slightly off next to edges
      const nearEdge = p[1] < 4.5 || p[2] > 9.9;
      expect(Math.abs(out[i][0] - sdBoxCpu(p))).toBeLessThan(nearEdge ? 0.2 : 0.06);
    });
  });

  it('caps empty-space skips at the tile edge and treats unloaded tiles as empty', async () => {
    const device = await getTestDevice();
    // empty brick column right of the boundary, far above the roof
    const [high] = await query([[17, 8, 30]]);
    expect(high[2]).toBeLessThanOrEqual(1);
    setTileEntry(device, scene, tileTableIndex(grid, 1, 0), TILE_NOT_RESIDENT);
    const [unloaded, loaded] = await query([[20, 8, 10.3], [12, 8, 10.3]]);
    expect(unloaded[1]).toBe(0);
    expect(unloaded[0]).toBeGreaterThan(0);
    expect(loaded[1]).toBe(1);
    setTileEntry(device, scene, tileTableIndex(grid, 1, 0), 1);
  });
});

describe('tiled vs single-grid rendering', () => {
  const W = 200;
  const H = 150;
  let frame: FrameResources;
  let tiled: SurfaceRenderer;
  let single: SurfaceRenderer;
  let tiledWaves: SurfaceRenderer;
  let singleWaves: SurfaceRenderer;

  beforeAll(async () => {
    const device = await getTestDevice();
    const scene = createTiledSceneResources(device, grid, { atlasBytes: 1 << 20, residentTiles: 2, paletteEntries: 4096 });
    await loadTiles(device, scene);
    const p = prepareBake(positions, triInfo, boxMin, boxMax, 1, { refineFactor: 1 });
    const atlas = await bakeAtlas(device, { positions, bins: p.bins, triPaletteIndex: p.palettes.triPaletteIndex, slotDescs: p.slotDescs, spec: p.spec, layout: p.layout });
    const ref = createSceneResources(device, { positions, triInfo, bins: p.bins, spec: p.spec, layout: p.layout, atlas, palettes: p.palettes, brickTable: p.brickTable });
    frame = createFrameResources(device, new Float32Array(4));
    tiled = await createTiledSdfRenderer(device, 'rgba8unorm', frame, scene);
    single = await createSdfRenderer(device, 'rgba8unorm', frame, ref);
    tiledWaves = await createTiledSdfRenderer(device, 'rgba8unorm', frame, scene, 'waveShell');
    singleWaves = await createSdfRenderer(device, 'rgba8unorm', frame, ref, 'waveShell');
  });

  const render = async (renderer: SurfaceRenderer, eye: [number, number, number]) => {
    const device = await getTestDevice();
    const gl = multiply(perspectiveGl(0.9, W / H, 0.5, 500), lookAt(eye, [16, 8, 4], [0, 0, 1]));
    device.queue.writeBuffer(frame.frame, 0, packFrameParams({
      viewProj: glToWebGpuClip(gl), invViewProj: invert(gl)!, sunDir: [0.3, -0.4, 0.866], sunIntensity: 1,
      viewport: [W, H], time: 0, colorMode: ColorMode.Surface, flags: 0, selected: 0, maxSteps: 256,
    }));
    const targets = createRenderTargets(device, W, H);
    const color = device.createTexture({ size: [W, H], format: 'rgba8unorm', usage: GPUTextureUsage.RENDER_ATTACHMENT });
    const enc = device.createCommandEncoder();
    encodeSurfacePass(enc, renderer, color.createView(), targets);
    device.queue.submit([enc.finish()]);
    return readIdTexture(device, targets);
  };

  for (const eye of [[40, -30, 25], [-10, 30, 15], [16, -4, 60]] as [number, number, number][]) {
    it(`renders the same building ids from ${eye.join(',')}`, async () => {
      const d = compareIdImages(await render(single, eye), await render(tiled, eye));
      expect(d.coverageA).toBeGreaterThan(0.02);
      expect(d.mismatchFraction).toBeLessThan(0.01);
    });
  }

  for (const eye of [[40, -30, 25], [16, -4, 60]] as [number, number, number][]) {
    it(`wave shells (/waves/<slug>/): tiled matches single-grid and cuts openings, from ${eye.join(',')}`, async () => {
      const waves = await render(tiledWaves, eye);
      const d = compareIdImages(await render(singleWaves, eye), waves);
      expect(d.coverageA).toBeGreaterThan(0.02);
      expect(d.mismatchFraction).toBeLessThan(0.01);
      expect(compareIdImages(await render(tiled, eye), waves).mismatchFraction).toBeGreaterThan(0.001);
    });
  }
});
