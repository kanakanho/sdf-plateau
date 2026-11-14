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
import { readBuffer } from '../gpu/buffers';
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
  let waveShell: SurfaceRenderer;

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
    waveShell = await createSdfRenderer(device, FORMAT, frame, scene, 'waveShell');
  });

  const render = async (renderer: SurfaceRenderer, eye: [number, number, number], flags: number, colorMode: number = ColorMode.Surface) => {
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
        colorMode,
        flags,
        selected: 0,
        maxSteps: 256,
      }),
    );
    const targets = createRenderTargets(device, W, H);
    const color = device.createTexture({ size: [W, H], format: FORMAT, usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC });
    const enc = device.createCommandEncoder();
    encodeSurfacePass(enc, renderer, color.createView(), targets);
    device.queue.submit([enc.finish()]);
    const ids = await readIdTexture(device, targets);
    return { ids, targets, color };
  };

  /** Alpha channel of an rgba8 colour target (premultiplied: ground shadows are their alpha). */
  const readAlpha = async (texture: GPUTexture) => {
    const device = await getTestDevice();
    const bytesPerRow = Math.ceil((W * 4) / 256) * 256;
    const buf = device.createBuffer({ size: bytesPerRow * H, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC });
    const enc = device.createCommandEncoder();
    enc.copyTextureToBuffer({ texture }, { buffer: buf, bytesPerRow }, [W, H]);
    device.queue.submit([enc.finish()]);
    const raw = new Uint8Array(await readBuffer(device, buf, buf.size));
    buf.destroy();
    return Uint8Array.from({ length: W * H }, (_, i) => raw[Math.floor(i / W) * bytesPerRow + (i % W) * 4 + 3]);
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

  it('height waves let sunlight through the holes, striping the ground shadows', async () => {
    const eye: [number, number, number] = [10, -60, 200];
    const flags = RenderFlag.Shadows | RenderFlag.Ground;
    const solid = await render(sdf, eye, flags, ColorMode.Surface);
    const waves = await render(sdf, eye, flags, ColorMode.Waves);
    const [aSolid, aWaves] = [await readAlpha(solid.color), await readAlpha(waves.color)];
    // ground pixels in both images that the solid buildings shadow
    const shadowed = [...aSolid.keys()].filter((i) => solid.ids[i] === 0 && waves.ids[i] === 0 && aSolid[i] > 90);
    expect(shadowed.length).toBeGreaterThan(200);
    const stillDark = shadowed.filter((i) => aWaves[i] > 90).length / shadowed.length;
    expect(stillDark).toBeGreaterThan(0.15);
    // the test boxes are 30-60 m tall, where the bands are wide (60-80 % solid), so openings are few
    expect(stillDark).toBeLessThan(0.97);
  });

  it('wave shells: the stripes cut openings into the buildings (pure SDF)', async () => {
    const eye: [number, number, number] = [120, -140, 90];
    const plain = await render(sdf, eye, 0, ColorMode.Surface);
    const cut = await render(waveShell, eye, RenderFlag.Refine, ColorMode.Waves); // refine is ignored here
    // the test boxes are 30-60 m tall, where the bands are wide (60-80 % solid), so openings are few
    expect(compareIdImages(plain.ids, cut.ids).mismatchFraction).toBeGreaterThan(0.002);
    const covered = (ids: Uint32Array) => ids.filter((v) => v !== 0).length;
    const ratio = covered(cut.ids) / covered(plain.ids);
    // openings remove part of the silhouette, far walls seen through them keep some of it
    expect(ratio).toBeGreaterThan(0.3);
    expect(ratio).toBeLessThan(0.99);
  });

  it('wave shells: soft shadows pass through the openings, striping the ground shadows', async () => {
    const eye: [number, number, number] = [10, -60, 200];
    const flags = RenderFlag.Shadows | RenderFlag.Ground;
    const solid = await render(sdf, eye, flags, ColorMode.Surface);
    const cut = await render(waveShell, eye, flags, ColorMode.Waves);
    const [aSolid, aCut] = [await readAlpha(solid.color), await readAlpha(cut.color)];
    const shadowed = [...aSolid.keys()].filter((i) => solid.ids[i] === 0 && cut.ids[i] === 0 && aSolid[i] > 90);
    expect(shadowed.length).toBeGreaterThan(200);
    // a closed shell lets light through only where both walls it crosses (and not a crest-solid
    // roof) are open, so most of the shadow stays dark; some of it must be lit through the openings
    const stillDark = shadowed.filter((i) => aCut[i] > 90).length / shadowed.length;
    expect(stillDark).toBeGreaterThan(0.1);
    // the test boxes are 30-60 m tall, where the bands are wide (60-80 % solid), so openings are few
    expect(stillDark).toBeLessThan(0.99);
  });

  it('readIdAt picks the building under a pixel', async () => {
    const device = await getTestDevice();
    const { ids, targets } = await render(sdf, [120, -140, 90], RenderFlag.Refine);
    const i = ids.findIndex((v) => v === 2);
    expect(i).toBeGreaterThanOrEqual(0);
    expect(await readIdAt(device, targets, i % W, Math.floor(i / W))).toBe(2);
  });
});
