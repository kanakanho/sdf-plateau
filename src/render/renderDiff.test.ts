/**
 * M3 automated check: render a small synthetic city with the raster reference and with the
 * SDF ray marcher from the same camera, then compare the building-id images.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { bakeAtlas } from '../bake/bakeGpu';
import { prepareBake } from '../bake/prepare';
import { packTriInfo } from '../data/meshFormat';
import { invert, lookAt, multiply, perspectiveGl } from '../geo/mat4';
import { boxTriangles, gableTriangles } from '../geom/boxMesh';
import { getTestDevice } from '../gpu/testDevice';
import { compareIdImages, interiorMismatches } from './compare';
import { ColorMode, RenderFlag, glToWebGpuClip, packFrameParams } from './frame';
import {
  type FrameResources,
  type SurfaceRenderer,
  createFrameResources,
  createRasterRenderer,
  createRenderTargets,
  createSdfRenderer,
  encodeSurfacePass,
  readIdAt,
  readIdTexture,
} from './renderers';
import { type SceneResources, createSceneResources } from './scene';

const W = 320;
const H = 240;
const FORMAT: GPUTextureFormat = 'rgba8unorm';

const meshes = [
  boxTriangles([0, 0, 0], [20, 15, 30]),
  boxTriangles([30, -5, 0], [45, 20, 60]),
  gableTriangles(-30, -10, -10, 10, 10, 16),
];
const positions = Float32Array.from(meshes.flatMap((m) => Array.from(m)));
const triInfo = Uint32Array.from(meshes.flatMap((m, b) => Array.from({ length: m.length / 9 }, () => packTriInfo(b, 1))));

const cameraMatrix = (eye: [number, number, number]) => {
  const gl = multiply(perspectiveGl((50 * Math.PI) / 180, W / H, 1, 2000), lookAt(eye, [5, 5, 15], [0, 0, 1]));
  return { gl, viewProj: glToWebGpuClip(gl), inv: invert(gl)! };
};

describe('raster vs SDF', () => {
  let frame: FrameResources;
  let scene: SceneResources;
  let raster: SurfaceRenderer;
  let sdf: SurfaceRenderer;

  beforeAll(async () => {
    const device = await getTestDevice();
    // mixed resolution: the more detailed bricks are refined to 0.5 m children
    const p = prepareBake(positions, triInfo, [-30, -10, 0], [45, 20, 60], 1, { refineFactor: 2, minScore: 6, maxSlots: 1e6 });
    expect(p.refinedBricks).toBeGreaterThan(0);
    expect(p.refinedBricks).toBeLessThan(p.bins.slotBricks.length);
    const atlas = await bakeAtlas(device, {
      positions,
      bins: p.bins,
      triPaletteIndex: p.palettes.triPaletteIndex,
      slotDescs: p.slotDescs,
      spec: p.spec,
      layout: p.layout,
    });
    scene = createSceneResources(device, {
      positions,
      triInfo,
      bins: p.bins,
      spec: p.spec,
      layout: p.layout,
      atlas,
      palettes: p.palettes,
      brickTable: p.brickTable,
      refineFactor: p.refineFactor,
    });
    frame = createFrameResources(device, new Float32Array(12));
    raster = await createRasterRenderer(device, FORMAT, frame, { tris: scene.tris, triInfo: scene.triInfo, triCount: triInfo.length });
    sdf = await createSdfRenderer(device, FORMAT, frame, scene);
  });

  const render = async (renderer: SurfaceRenderer, eye: [number, number, number], flags: number) => {
    const device = await getTestDevice();
    const cam = cameraMatrix(eye);
    device.queue.writeBuffer(
      frame.frame,
      0,
      packFrameParams({
        viewProj: cam.viewProj,
        invViewProj: cam.inv,
        sunDir: [0.3, -0.4, 0.866],
        sunIntensity: 1,
        viewport: [W, H],
        time: 0,
        colorMode: ColorMode.Surface,
        flags,
        selected: 0,
        maxSteps: 256,
      }),
    );
    const targets = createRenderTargets(device, W, H);
    const color = device.createTexture({ size: [W, H], format: FORMAT, usage: GPUTextureUsage.RENDER_ATTACHMENT });
    const enc = device.createCommandEncoder();
    encodeSurfacePass(enc, renderer, color.createView(), targets);
    device.queue.submit([enc.finish()]);
    const ids = await readIdTexture(device, targets);
    return { ids, targets };
  };

  for (const eye of [
    [120, -140, 90],
    [-90, 110, 40],
    [10, -60, 200],
  ] as [number, number, number][]) {
    it(`matches the raster reference from ${eye.join(',')} (with exact hit refinement)`, async () => {
      const a = await render(raster, eye, 0);
      const b = await render(sdf, eye, RenderFlag.Refine);
      const d = compareIdImages(a.ids, b.ids);
      expect(d.coverageA).toBeGreaterThan(0.02);
      expect(Math.abs(d.coverageA - d.coverageB)).toBeLessThan(0.005);
      expect(d.mismatchFraction).toBeLessThan(0.005);
      expect(interiorMismatches(a.ids, b.ids, W)).toBe(0);
    });

    it(`stays close to the raster reference from ${eye.join(',')} (pure SDF)`, async () => {
      const a = await render(raster, eye, 0);
      const b = await render(sdf, eye, 0);
      const d = compareIdImages(a.ids, b.ids);
      // the r8 SDF rounds edges by a fraction of a voxel; ids come from the baked id volume
      expect(d.mismatchFraction).toBeLessThan(0.02);
      expect(interiorMismatches(a.ids, b.ids, W)).toBeLessThan(W * H * 0.001);
    });
  }

  it('readIdAt picks the building under a pixel', async () => {
    const device = await getTestDevice();
    const { ids, targets } = await render(sdf, [120, -140, 90], RenderFlag.Refine);
    const i = ids.findIndex((v) => v === 2);
    expect(i).toBeGreaterThanOrEqual(0);
    expect(await readIdAt(device, targets, i % W, Math.floor(i / W))).toBe(2);
  });
});
