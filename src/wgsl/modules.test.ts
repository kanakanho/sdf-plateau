/** GPU unit tests for each WGSL function, compared against CPU references. */
import { describe, expect, it } from 'vitest';
import { invert, multiply, translation } from '../geo/mat4';
import { closestPointOnTriangle } from '../geom/triangle';
import type { V3 } from '../geom/vec3';
import { evalWgsl } from '../gpu/harness';
import { getTestDevice } from '../gpu/testDevice';
import { linkWgsl } from './link';
import { brickGrid, closestPointTriangle, palette, rayBox, rayFromNdc, rayTriangle, sdBox, sdfCodec } from './modules';

const run = async (prelude: string, body: string, inputs: number[][]) =>
  evalWgsl(await getTestDevice(), { prelude, body, inputs });

describe('sdBox', () => {
  it('matches the analytic box distance', async () => {
    const out = await run(linkWgsl(sdBox), 'return vec4f(sdBox(v.xyz, vec3f(1.0, 2.0, 3.0)));', [
      [0, 0, 0],
      [3, 0, 0],
      [0, 0, -4],
      [2, 3, 3],
      [0.5, 0, 0],
    ]);
    expect(out.map((r) => r[0])).toEqual([
      -1,
      2,
      1,
      expect.closeTo(Math.SQRT2, 5),
      -0.5,
    ]);
  });
});

describe('rayBox', () => {
  it('returns entry/exit distances and reports misses', async () => {
    const out = await run(
      linkWgsl(rayBox),
      'return vec4f(rayBox(vec3f(-5.0, v.y, 0.5), vec3f(1.0, 0.0, 0.0), vec3f(0.0), vec3f(1.0)), 0.0, 0.0);',
      [[0, 0.5], [0, 3]],
    );
    expect(out[0].slice(0, 2)).toEqual([5, 6]);
    expect(out[1][0]).toBeGreaterThan(out[1][1]);
  });
});

describe('rayFromNdc', () => {
  it('unprojects through an inverse view-projection', async () => {
    // simple perspective looking down -z from the origin
    const n = 1, f = 100;
    const persp = Float64Array.from([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, -(f + n) / (f - n), -1, 0, 0, (-2 * f * n) / (f - n), 0]);
    const view = translation(0, 0, -10); // camera at z=+10
    const inv = invert(multiply(persp, view))!;
    const m = Array.from(inv);
    const out = await run(
      linkWgsl(rayFromNdc),
      `let m = mat4x4f(${m.map((x) => x.toFixed(9)).join(', ')});
       let r = rayFromNdc(m, v.xy);
       if (v.z > 0.5) { return vec4f(r.dir, 0.0); }
       return vec4f(r.origin, 0.0);`,
      [[0, 0, 0], [0, 0, 1], [1, 0, 1]],
    );
    expect(out[0][2]).toBeCloseTo(9, 4); // near plane at z = 10 - 1
    expect(out[1][2]).toBeCloseTo(-1, 5);
    expect(out[2][0]).toBeCloseTo(Math.SQRT1_2, 5);
    expect(out[2][2]).toBeCloseTo(-Math.SQRT1_2, 5);
  });
});

describe('closestPointTriangle', () => {
  const tri: [V3, V3, V3] = [[0, 0, 0], [4, 0, 0], [0, 3, 1]];
  const pts: V3[] = [[1, 1, 5], [-2, -2, 0], [5, 1, 0], [2, 2, 0.6], [0, 1.5, -3], [1.3, 0.7, 0.2], [5, -1, 0], [-1, 4, 2]];
  it('matches the CPU reference in every Voronoi region', async () => {
    const out = await run(
      linkWgsl(closestPointTriangle),
      'return vec4f(closestPointTriangle(v.xyz, vec3f(0.0), vec3f(4.0, 0.0, 0.0), vec3f(0.0, 3.0, 1.0)), 0.0);',
      pts.map((p) => [...p]),
    );
    pts.forEach((p, i) => {
      const q = closestPointOnTriangle(p, ...tri);
      q.forEach((c, k) => expect(out[i][k]).toBeCloseTo(c, 4));
    });
  });
});

describe('rayTriangle', () => {
  const body = 'return vec4f(rayTriangle(v.xyz, vec3f(0.0, 0.0, -1.0), vec3f(0.0), vec3f(1.0, 0.0, 0.0), vec3f(0.0, 1.0, 0.0)));';
  it('returns the hit distance from either side', async () => {
    const out = await run(linkWgsl(rayTriangle), body, [[0.2, 0.2, 5], [0.2, 0.2, -1], [0.9, 0.9, 5], [0.2, 0.2, 0.5]]);
    expect(out.map((r) => r[0])).toEqual([5, -1, -1, 0.5]);
  });
  it('misses parallel rays', async () => {
    const out = await run(
      linkWgsl(rayTriangle),
      'return vec4f(rayTriangle(v.xyz, vec3f(1.0, 0.0, 0.0), vec3f(0.0), vec3f(1.0, 0.0, 0.0), vec3f(0.0, 1.0, 0.0)));',
      [[-1, 0.2, 0]],
    );
    expect(out[0][0]).toBe(-1);
  });
});

describe('sdfCodec', () => {
  it('encodes into [0,1] around 0.5 and decodes back', async () => {
    const out = await run(linkWgsl(sdfCodec), 'let e = encodeSdf(v.x, 4.0); return vec4f(e, decodeSdf(e, 4.0), 0.0, 0.0);', [[0], [2], [-4], [10]]);
    expect(out.map((r) => r[0])).toEqual([0.5, 0.75, 0, 1]);
    expect(out.map((r) => r[1])).toEqual([0, 2, -4, 4]);
  });
});

describe('brickGrid', () => {
  const src = linkWgsl(brickGrid);
  it('brickCoordOf floors relative to the grid origin', async () => {
    const out = await run(src, 'return vec4f(vec3f(brickCoordOf(v.xyz, vec3f(-10.0, 0.0, 0.0), 8.0)), 0.0);', [
      [-10, 0, 0],
      [-2.1, 7.9, 16],
      [-11, 0, 0],
    ]);
    expect(out.map((r) => r.slice(0, 3))).toEqual([[0, 0, 0], [0, 0, 2], [-1, 0, 0]]);
  });
  it('brickLinearIndex is x-fastest and -1 outside', async () => {
    const out = await run(src, 'return vec4f(f32(brickLinearIndex(vec3i(v.xyz), vec3u(4u, 3u, 2u))));', [
      [0, 0, 0],
      [1, 0, 0],
      [0, 1, 0],
      [3, 2, 1],
      [4, 0, 0],
      [-1, 0, 0],
    ]);
    expect(out.map((r) => r[0])).toEqual([0, 1, 4, 23, -1, -1]);
  });
  it('brickIsEmpty / brickEmptyDistance decode entries', async () => {
    const out = await run(
      src,
      'let e = select(u32(v.x), BRICK_EMPTY_FLAG | u32(v.x), v.y > 0.5); return vec4f(select(0.0, 1.0, brickIsEmpty(e)), f32(brickEmptyDistance(e)), 0.0, 0.0);',
      [[7, 1], [7, 0]],
    );
    expect(out[0].slice(0, 2)).toEqual([1, 7]);
    expect(out[1].slice(0, 2)).toEqual([0, 7]);
  });
  it('brickIsRefined / brickChildBase decode refined entries', async () => {
    const out = await run(
      src,
      `let e = select(u32(v.x), BRICK_REFINED_FLAG | u32(v.x), v.y > 0.5);
       let f = select(e, BRICK_EMPTY_FLAG | 3u, v.z > 0.5);
       return vec4f(select(0.0, 1.0, brickIsRefined(f)), f32(brickChildBase(f)), select(0.0, 1.0, brickIsEmpty(f)), 0.0);`,
      [[1234, 1, 0], [1234, 0, 0], [0, 1, 1]],
    );
    expect(out.map((r) => r.slice(0, 3))).toEqual([[1, 1234, 0], [0, 1234, 0], [0, 3, 1]]);
  });
  it('childIndexOf picks and clamps the child cell', async () => {
    const out = await run(src, 'return vec4f(vec3f(childIndexOf(v.xyz, 4.0, 2u)), 0.0);', [
      [0, 0, 0],
      [4.5, 1, 7.9],
      [-0.1, 8.2, 3.9],
    ]);
    expect(out.map((r) => r.slice(0, 3))).toEqual([[0, 0, 0], [1, 0, 1], [0, 1, 0]]);
  });
  it('atlasSlotOrigin lays slots out x-fastest in 9-sample steps', async () => {
    const out = await run(src, 'return vec4f(vec3f(atlasSlotOrigin(u32(v.x), 4u, 2u)), 0.0);', [[0], [5], [9]]);
    expect(out.map((r) => r.slice(0, 3))).toEqual([[0, 0, 0], [9, 9, 0], [9, 0, 9]]);
  });
  it('atlasUvw maps voxel-local coordinates to texel centres', async () => {
    const out = await run(src, 'return vec4f(atlasUvw(v.xyz, vec3u(9u, 0u, 0u), vec3f(18.0, 9.0, 9.0)), 0.0);', [
      [0, 0, 0],
      [8, 8, 8],
      [-1, 9, 4],
    ]);
    expect(out[0].slice(0, 3).map((x) => +x.toFixed(5))).toEqual([+(9.5 / 18).toFixed(5), +(0.5 / 9).toFixed(5), +(0.5 / 9).toFixed(5)]);
    expect(out[1][0]).toBeCloseTo(17.5 / 18, 5);
    expect(out[2][0]).toBeCloseTo(9.5 / 18, 5); // clamped
    expect(out[2][1]).toBeCloseTo(8.5 / 9, 5); // clamped
  });
  it('exitDistance measures the distance to the box boundary', async () => {
    const out = await run(src, 'return vec4f(exitDistance(v.xyz, normalize(vec3f(1.0, 0.0, 0.0)), vec3f(0.0), vec3f(8.0)));', [
      [2, 4, 4],
      [8, 4, 4],
    ]);
    expect(out.map((r) => r[0])).toEqual([6, 0]);
  });
});

describe('palette', () => {
  const src = linkWgsl(palette);
  it('srgb/linear conversions round-trip', async () => {
    const out = await run(src, 'return vec4f(linearToSrgb(srgbToLinear(v.xyz)), 0.0);', [[0.25, 0.5, 0.75]]);
    out[0].slice(0, 3).forEach((x, i) => expect(x).toBeCloseTo([0.25, 0.5, 0.75][i], 4));
  });
  it('surfaceColor distinguishes roofs from walls', async () => {
    const out = await run(src, 'return vec4f(surfaceColor(u32(v.x)), 0.0);', [[0], [1]]);
    expect(out[0]).not.toEqual(out[1]);
  });
  it('heightColor clamps to the ramp ends', async () => {
    const out = await run(src, 'return vec4f(heightColor(v.x), 0.0);', [[-10], [0], [1000], [250]]);
    expect(out[0]).toEqual(out[1]);
    expect(out[2]).toEqual(out[3]);
  });
  it('usageColor returns grey for unknown categories', async () => {
    const out = await run(src, 'return vec4f(usageColor(u32(v.x)), 0.0);', [[0], [99], [1]]);
    expect(out[0]).toEqual(out[1]);
    expect(out[2]).not.toEqual(out[0]);
  });
  it('yearColor marks unknown years', async () => {
    const out = await run(src, 'return vec4f(yearColor(v.x), 0.0);', [[0], [1900], [2025]]);
    expect(out[0].slice(0, 3).map((x) => +x.toFixed(3))).toEqual([0.6, 0.6, 0.6]);
    expect(out[1]).not.toEqual(out[2]);
  });
});

