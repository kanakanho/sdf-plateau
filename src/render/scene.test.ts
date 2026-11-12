import { describe, expect, it } from 'vitest';
import { computeAtlasLayout } from '../bake/atlasLayout';
import { createAtlasTexture } from '../bake/bakeGpu';
import { binTriangles } from '../bake/binning';
import { computeGridSpec } from '../bake/gridSpec';
import { buildSlotPalettes } from '../bake/palette';
import { boxTriangles } from '../geom/boxMesh';
import { withValidation } from '../gpu/shader';
import { getTestDevice } from '../gpu/testDevice';
import { createRenderTargets, destroyRenderTargets } from './renderers';
import { createSceneResources, destroySceneResources, sceneBindings } from './scene';

const makeScene = async () => {
  const device = await getTestDevice();
  const positions = boxTriangles([0, 0, 0], [4, 4, 4]);
  const spec = computeGridSpec([0, 0, 0], [4, 4, 4], { voxelSize: 1 });
  const bins = binTriangles(positions, spec);
  const layout = computeAtlasLayout(bins.slotBricks.length);
  const triInfo = new Uint32Array(12);
  const atlas = { distance: createAtlasTexture(device, layout), id: createAtlasTexture(device, layout, 'r8uint') };
  const palettes = buildSlotPalettes(bins, triInfo);
  return { device, scene: createSceneResources(device, { positions, triInfo, bins, spec, layout, atlas, palettes }), atlas: atlas.distance, idAtlas: atlas.id, layout };
};

describe('createAtlasTexture', () => {
  it('creates 3D textures of the layout size (r8unorm distance, r8uint id)', async () => {
    const { atlas, idAtlas, layout } = await makeScene();
    expect(atlas.format).toBe('r8unorm');
    expect(idAtlas.format).toBe('r8uint');
    expect(atlas.dimension).toBe('3d');
    expect([atlas.width, atlas.height, atlas.depthOrArrayLayers]).toEqual(layout.size);
  });
});

describe('createSceneResources / sceneBindings', () => {
  it('exposes 10 consecutive bindings matching sdfScene.wgsl names', async () => {
    const { scene } = await makeScene();
    const b = sceneBindings(scene, 2);
    expect(b.map((x) => x.binding)).toEqual([2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    const names = b.map((x) => /var(?:<[^>]+>)?\s+(\w+)/.exec(x.decl)![1]);
    expect(names).toEqual([
      'scene', 'brickTable', 'sdfAtlas', 'sdfSampler', 'sceneTris', 'sceneTriInfo', 'slotTriOffsets', 'slotTriIndices',
      'idAtlas', 'slotPalettes',
    ]);
    expect(scene.triCount).toBe(12);
  });
});

describe('destroySceneResources', () => {
  it('destroys all buffers (using one afterwards is a validation error)', async () => {
    const { device, scene } = await makeScene();
    destroySceneResources(scene);
    await expect(
      withValidation(device, () => {
        const enc = device.createCommandEncoder();
        enc.clearBuffer(scene.tris);
        device.queue.submit([enc.finish()]);
      }),
    ).rejects.toThrow();
  });
});

describe('createRenderTargets / destroyRenderTargets', () => {
  it('creates id and depth targets of the requested size and destroys them', async () => {
    const device = await getTestDevice();
    const t = createRenderTargets(device, 64, 32);
    expect([t.id.width, t.id.height, t.id.format]).toEqual([64, 32, 'r32uint']);
    expect(t.depth.format).toBe('depth24plus');
    destroyRenderTargets(t);
    await expect(
      withValidation(device, () => {
        const enc = device.createCommandEncoder();
        const pass = enc.beginRenderPass({
          colorAttachments: [{ view: t.id.createView(), loadOp: 'clear', storeOp: 'store' }],
        });
        pass.end();
        device.queue.submit([enc.finish()]);
      }),
    ).rejects.toThrow();
  });
});
