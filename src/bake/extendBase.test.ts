import { describe, expect, it } from 'vitest';
import { boxTriangles } from '../geom/boxMesh';
import { extendBelowGround } from './extendBase';

describe('extendBelowGround', () => {
  it('moves ground-level vertices down and leaves the rest', () => {
    const out = extendBelowGround(new Float32Array([0, 0, 0, 1, 0, 0.04, 1, 1, 10, 2, 2, -1]), 2);
    expect(Array.from(out)).toEqual([0, 0, -2, 1, 0, expect.closeTo(-1.96, 5), 1, 1, 10, 2, 2, -3]);
  });
  it('does not modify the input', () => {
    const input = new Float32Array([0, 0, 0]);
    extendBelowGround(input, 2);
    expect(input[2]).toBe(0);
  });
  it('keeps walls vertical (x/y untouched) for a box on the ground', () => {
    const box = boxTriangles([0, 0, 0], [5, 5, 10]);
    const out = extendBelowGround(box, 3);
    for (let i = 0; i < box.length; i += 3) {
      expect(out[i]).toBe(box[i]);
      expect(out[i + 1]).toBe(box[i + 1]);
      expect(out[i + 2]).toBe(box[i + 2] === 0 ? -3 : box[i + 2]);
    }
  });
});

describe('extendBelowGround (baked SDF at the foot of a wall)', () => {
  it('removes the rounding of the bottom edge near the ground plane', async () => {
    const { getTestDevice } = await import('../gpu/testDevice');
    const { evalWgsl } = await import('../gpu/harness');
    const { prepareBake } = await import('./prepare');
    const { bakeAtlas } = await import('./bakeGpu');
    const { createSceneResources, sceneBindings } = await import('../render/scene');
    const { linkWgsl } = await import('../wgsl/link');
    const { sdfScene } = await import('../wgsl/modules');
    const { computeBounds } = await import('../data/meshFormat');
    const device = await getTestDevice();
    // points on the wall x = 10.9 (half way between samples), just above the ground: the distance should be 0.
    // Without the extension the bottom face (z = 0) pulls the zero level inwards near the base.
    const pts = [[10.9, 15.3, 0.05], [10.9, 12.6, 0.15], [10.9, 17.2, 0.3]];
    const sample = async (positions: Float32Array) => {
      const b = computeBounds(positions);
      const p = prepareBake(positions, new Uint32Array(positions.length / 9), b.min, b.max, 1, { refineFactor: 1 });
      const atlas = await bakeAtlas(device, { positions, bins: p.bins, triPaletteIndex: p.palettes.triPaletteIndex, slotDescs: p.slotDescs, spec: p.spec, layout: p.layout });
      const scene = createSceneResources(device, { positions, triInfo: new Uint32Array(positions.length / 9), bins: p.bins, spec: p.spec, layout: p.layout, atlas, palettes: p.palettes, brickTable: p.brickTable });
      const out = await evalWgsl(device, { prelude: linkWgsl(sdfScene), body: 'return vec4f(sceneDistance(v.xyz));', inputs: pts, extra: sceneBindings(scene, 2) });
      return out.map((r) => r[0]);
    };
    const box = boxTriangles([0.4, 0.4, 0], [10.9, 20.4, 12]);
    const plain = await sample(box);
    const extended = await sample(extendBelowGround(box, 3));
    for (let i = 0; i < pts.length; i++) {
      expect(Math.abs(extended[i])).toBeLessThan(0.03);
      expect(plain[i]).toBeGreaterThan(0.1);
    }
  });
});
