/** GPU unit tests for frame.wgsl and shading.wgsl. */
import { describe, expect, it } from 'vitest';
import { evalWgsl } from '../gpu/harness';
import { getTestDevice } from '../gpu/testDevice';
import { linkWgsl } from './link';
import { frame, palette, shading } from './modules';

const run = async (prelude: string, body: string, inputs: number[][]) =>
  evalWgsl(await getTestDevice(), { prelude, body, inputs });

describe('hasFlag', () => {
  it('tests individual bits', async () => {
    const out = await run(linkWgsl(frame), 'return vec4f(select(0.0, 1.0, hasFlag(u32(v.x), u32(v.y))));', [
      [5, 4],
      [5, 2],
      [15, 8],
    ]);
    expect(out.map((r) => r[0])).toEqual([1, 0, 1]);
  });
});

describe('albedoFor', () => {
  it('dispatches on colour mode', async () => {
    const src = linkWgsl(shading, palette);
    const out = await run(
      src,
      `let attrs = vec4f(120.0, 2.0, 1990.0, 2.0);
       var expected = surfaceColor(1u);
       if (u32(v.x) == 1u) { expected = heightColor(120.0); }
       if (u32(v.x) == 2u) { expected = usageColor(2u); }
       if (u32(v.x) == 3u) { expected = yearColor(1990.0); }
       return vec4f(distance(albedoFor(u32(v.x), 1u, attrs), expected));`,
      [[0], [1], [2], [3]],
    );
    expect(out.map((r) => r[0])).toEqual([0, 0, 0, 0]);
  });
});

describe('shadeSurface', () => {
  const body = 'return vec4f(shadeSurface(vec3f(0.8), normalize(v.xyz), vec4f(0.0, 0.0, 1.0, 1.0), v.w, 1.0), 0.0);';
  it('lit faces are brighter than faces turned away from the sun', async () => {
    const out = await run(linkWgsl(shading), body, [[0, 0, 1, 1], [1, 0, 0, 1]]);
    expect(out[0][0]).toBeGreaterThan(out[1][0]);
  });
  it('shadowed faces are darker', async () => {
    const out = await run(linkWgsl(shading), body, [[0, 0, 1, 1], [0, 0, 1, 0]]);
    expect(out[0][0]).toBeGreaterThan(out[1][0]);
    expect(out[1][0]).toBeGreaterThan(0); // ambient keeps shadows readable
  });
});

describe('stepsColor', () => {
  it('ramps from blue to red', async () => {
    const out = await run(linkWgsl(shading), 'return vec4f(stepsColor(v.x, 100.0), 0.0);', [[0], [100], [500]]);
    expect(out[0][2]).toBeGreaterThan(out[0][0]);
    expect(out[1][0]).toBeGreaterThan(out[1][2]);
    expect(out[2]).toEqual(out[1]);
  });
});

describe('surfaceTypeFromNormal', () => {
  it('classifies roof / wall / ground by the normal and keeps installations', async () => {
    const out = await run(linkWgsl(shading), 'return vec4f(f32(surfaceTypeFromNormal(u32(v.w), normalize(v.xyz))));', [
      [0, 0, 1, 0], // wall id on an upward face -> roof
      [1, 0, 0, 1], // roof id on a vertical face -> wall
      [0, 0.3, -1, 0], // downward -> ground
      [0.6, 0, 0.8, 1], // sloped roof stays roof
      [0, 0, 1, 3], // installation keeps its id
      [1, 0, 0, 5], // other keeps its id
    ]);
    expect(out.map((r) => r[0])).toEqual([1, 0, 2, 1, 3, 5]);
  });
});
