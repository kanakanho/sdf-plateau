/** End-to-end bake tests: bake a box and compare the atlas with the analytic box SDF. */
import { beforeAll, describe, expect, it } from 'vitest';
import { boxTriangles } from '../geom/boxMesh';
import { readBuffer } from '../gpu/buffers';
import { evalWgsl } from '../gpu/harness';
import { getTestDevice } from '../gpu/testDevice';
import { type SceneResources, createSceneResources, sceneBindings } from '../render/scene';
import { linkWgsl } from '../wgsl/link';
import { sdfScene } from '../wgsl/modules';
import { slotOrigin } from './atlasLayout';
import { bakeAtlas, planBakeRuns } from './bakeGpu';
import { SurfaceType, packTriInfo } from '../data/meshFormat';
import { prepareBake } from './prepare';

const BOX_MIN = [10, 10, 0] as const;
const BOX_MAX = [20, 25, 12] as const;

const sdBoxCpu = (p: number[]) => {
  const c = [0, 1, 2].map((k) => (BOX_MIN[k] + BOX_MAX[k]) / 2);
  const h = [0, 1, 2].map((k) => (BOX_MAX[k] - BOX_MIN[k]) / 2);
  const q = [0, 1, 2].map((k) => Math.abs(p[k] - c[k]) - h[k]);
  const outside = Math.hypot(...q.map((v) => Math.max(v, 0)));
  return outside + Math.min(Math.max(...q), 0);
};

describe('planBakeRuns', () => {
  it('splits rows into runs and never crosses a layer', () => {
    const layout = { slotsX: 128, slotsY: 3, slotsZ: 2, size: [1152, 27, 18] as [number, number, number] };
    const runs = planBakeRuns(128 * 5 + 10, layout, 2);
    expect(runs.map((r) => [r.slotStart, r.slotCount, r.origin[1], r.origin[2]])).toEqual([
      [0, 256, 0, 0],
      [256, 128, 18, 0],
      [384, 256, 0, 9],
      [640, 10, 18, 9],
    ]);
  });
});

// Same tests with plain 1 m bricks and with every brick refined to 0.5 m children.
describe.each([
  { name: 'coarse bricks', refine: { refineFactor: 1 }, maxErr: 0.35, truncation: 4 },
  { name: 'refined bricks', refine: { refineFactor: 2, minScore: 0, maxSlots: 1e6 }, maxErr: 0.2, truncation: 2 },
])('bakeAtlas ($name)', ({ refine, maxErr: maxErrAllowed, truncation: cellTruncation }) => {
  let scene: SceneResources;
  let atlas: GPUTexture;
  // boxTriangles order: bottom(2), top(2), then 8 wall triangles; building index 5
  const triInfo = Uint32Array.from({ length: 12 }, (_, i) =>
    packTriInfo(5, i < 2 ? SurfaceType.Ground : i < 4 ? SurfaceType.Roof : SurfaceType.Wall),
  );
  const positions = boxTriangles(BOX_MIN, BOX_MAX);
  const prepared = prepareBake(positions, triInfo, [0, 0, 0], [30, 35, 20], 1, refine);
  const { spec, bins, layout } = prepared;

  beforeAll(async () => {
    const device = await getTestDevice();
    const baked = await bakeAtlas(device, {
      positions,
      bins,
      triPaletteIndex: prepared.palettes.triPaletteIndex,
      slotDescs: prepared.slotDescs,
      spec,
      layout,
    });
    atlas = baked.distance;
    scene = createSceneResources(device, {
      positions,
      triInfo,
      bins,
      spec,
      layout,
      atlas: baked,
      palettes: prepared.palettes,
      brickTable: prepared.brickTable,
      refineFactor: prepared.refineFactor,
    });
  });

  it('refines bricks only when asked to', () => {
    expect(prepared.refinedBricks > 0).toBe(refine.refineFactor > 1);
  });

  it('writes exact truncated distances at brick samples', async () => {
    const device = await getTestDevice();
    const bytesPerRow = 1280;
    const buf = device.createBuffer({ size: bytesPerRow * layout.size[1] * layout.size[2], usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC });
    const enc = device.createCommandEncoder();
    enc.copyTextureToBuffer({ texture: atlas }, { buffer: buf, bytesPerRow, rowsPerImage: layout.size[1] }, layout.size);
    device.queue.submit([enc.finish()]);
    const bytes = new Uint8Array(await readBuffer(device, buf, buf.size));
    let checked = 0;
    for (let slot = 0; slot < bins.slotBricks.length; slot += 3) {
      const d = prepared.slotDescs.subarray(slot * 4, slot * 4 + 4);
      const truncation = (spec.truncation / spec.voxelSize) * d[3];
      const o = slotOrigin(layout, slot);
      for (const s of [[0, 0, 0], [4, 4, 4], [8, 3, 1], [2, 7, 5]]) {
        const p = [0, 1, 2].map((k) => d[k] + s[k] * d[3]);
        const expected = Math.max(-truncation, Math.min(truncation, sdBoxCpu(p)));
        const byte = bytes[(o[2] + s[2]) * bytesPerRow * layout.size[1] + (o[1] + s[1]) * bytesPerRow + o[0] + s[0]];
        const decoded = (byte / 255 - 0.5) * 2 * truncation;
        expect(Math.abs(decoded - expected)).toBeLessThan(0.02);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(10);
  });

  it('sceneDistance (WGSL) reproduces the box SDF near the surface', async () => {
    const device = await getTestDevice();
    const pts: number[][] = [];
    let seed = 3;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    while (pts.length < 200) {
      const p = [5 + rnd() * 20, 5 + rnd() * 25, rnd() * 16];
      if (Math.abs(sdBoxCpu(p)) < 3) pts.push(p);
      if (Math.abs(sdBoxCpu(p)) < 0.9) pts.push(p);
    }
    const out = await evalWgsl(device, {
      prelude: linkWgsl(sdfScene),
      body: 'return vec4f(sceneDistance(v.xyz));',
      inputs: pts,
      extra: sceneBindings(scene, 2),
    });
    let maxErr = 0;
    pts.forEach((p, i) => {
      const d = sdBoxCpu(p);
      // never overestimates outside or near the surface (safe for sphere tracing from outside);
      // deep inside, empty cells only carry an unsigned bound, which rays from outside never reach
      if (d > -0.5) expect(out[i][0]).toBeLessThanOrEqual(Math.max(d, -cellTruncation) + 0.35);
      if (Math.abs(d) > 0.1 && d > -0.5) expect(Math.sign(out[i][0])).toBe(Math.sign(d));
      // within the occupancy margin the brick is guaranteed to be baked: values are accurate
      if (Math.abs(d) < 0.9) maxErr = Math.max(maxErr, Math.abs(out[i][0] - d));
    });
    // trilinear interpolation of an exact SDF is exact on faces and close near edges
    expect(maxErr).toBeLessThan(maxErrAllowed);
  });

  it('sceneDistance is a conservative bound far away from the surface', async () => {
    const device = await getTestDevice();
    const pts = [[-1, -1, 19], [29, 34, 19], [1, 30, 1], [-50, 0, 0]];
    const out = await evalWgsl(device, {
      prelude: linkWgsl(sdfScene),
      body: 'return vec4f(sceneDistance(v.xyz));',
      inputs: pts,
      extra: sceneBindings(scene, 2),
    });
    pts.forEach((p, i) => {
      expect(out[i][0]).toBeGreaterThan(0);
      expect(out[i][0]).toBeLessThanOrEqual(sdBoxCpu(p) + 1e-3);
    });
  });

  it('sceneDistanceInfo flags true distances only inside the truncation band', async () => {
    const device = await getTestDevice();
    const pts = [[15, 17, 12.5], [15, 17, 13.5], [15, 17, 19], [-50, 0, 0]]; // roof at z=12, brick [6,14] occupied
    const out = await evalWgsl(device, {
      prelude: linkWgsl(sdfScene),
      body: 'return vec4f(sceneDistanceInfo(v.xyz), 0.0, 0.0);',
      inputs: pts,
      extra: sceneBindings(scene, 2),
    });
    expect(out.map((r) => r[1])).toEqual([1, 1, 0, 0]);
    expect(out[0][0]).toBeCloseTo(0.5, 1);
    expect(out[1][0]).toBeCloseTo(1.5, 1);
  });

  it('intersectSlot finds the exact box face', async () => {
    const device = await getTestDevice();
    // ray straight down onto the roof at (15, 17, 12)
    const out = await evalWgsl(device, {
      prelude: linkWgsl(sdfScene),
      body: `let p = vec3f(15.0, 17.0, 12.5);
        let cell = locateCell(p);
        if (cell.empty) { return vec4f(-1.0); }
        let h = intersectSlot(p, vec3f(0.0, 0.0, -1.0), cell.slot);
        return vec4f(h.t, triNormal(h.tri).z, f32(sceneTriInfo[h.tri] & 7u), 0.0);`,
      inputs: [[0]],
      extra: sceneBindings(scene, 2),
    });
    expect(out[0][0]).toBeCloseTo(0.5, 5);
    expect(out[0][1]).toBeCloseTo(1, 5);
    expect(out[0][2]).toBe(SurfaceType.Roof);
  });

  it('sceneInfoAt reads building and surface type from the baked id volume', async () => {
    const device = await getTestDevice();
    // on the roof, on two walls, on a roof edge sample just above, and in empty space
    const pts = [[15, 17, 12], [10, 17, 6], [15, 25, 3], [18, 22, 11.9], [-50, 0, 0]];
    const out = await evalWgsl(device, {
      prelude: linkWgsl(sdfScene),
      body: `let info = sceneInfoAt(v.xyz);
        if (info == 0xffffffffu) { return vec4f(-1.0); }
        return vec4f(f32(info >> 3u), f32(info & 7u), 0.0, 0.0);`,
      inputs: pts,
      extra: sceneBindings(scene, 2),
    });
    expect(out.map((r) => r.slice(0, 2))).toEqual([
      [5, SurfaceType.Roof],
      [5, SurfaceType.Wall],
      [5, SurfaceType.Wall],
      [5, SurfaceType.Roof],
      [-1, -1],
    ]);
  });
});
