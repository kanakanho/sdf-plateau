/** GPU unit tests for frame.wgsl and shading.wgsl. */
import { describe, expect, it } from 'vitest';
import { evalWgsl } from '../gpu/harness';
import { getTestDevice } from '../gpu/testDevice';
import { linkWgsl } from './link';
import { frame, palette, sceneShape, shading } from './modules';

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

// mirrors HEIGHT_WAVE_BASE / HEIGHT_WAVE_GROWTH in shading.wgsl
const WAVE_BASE = 6.0;
const WAVE_GROWTH = 0.0;
const waveLength = (z: number) => WAVE_BASE + WAVE_GROWTH * Math.max(z, 0);
/** height where heightWavePhase = 0.5 (half a cycle above the ground) */
/** mirrors HEIGHT_WAVE_DUTY_* and heightWaveDuty: solid share of a cycle, low at the ground to high at top */
const DUTY_LOW = 0.8;
const DUTY_HIGH = 0.35;
const DUTY_TOP = 150;
const waveDuty = (z: number) => DUTY_LOW + (DUTY_HIGH - DUTY_LOW) * Math.min(Math.max(z / DUTY_TOP, 0), 1);
/** cycles from the nearest crest at the origin at t = 0 (no sway, no drift), growth 0 */
const fromCrestAtOrigin = (z: number) => Math.abs((((Math.max(z, 0) / WAVE_BASE + 0.5) % 1) + 1) % 1 - 0.5);
const zHalf = WAVE_GROWTH > 0 ? (WAVE_BASE / WAVE_GROWTH) * (Math.exp(0.5 * WAVE_GROWTH) - 1) : 0.5 * WAVE_BASE;

describe('heightWaveLength', () => {
  it('follows base + growth * height and clamps below ground', async () => {
    const out = await run(linkWgsl(shading), 'return vec4f(heightWaveLength(v.x));', [[0], [100], [-10]]);
    expect(out[0][0]).toBeCloseTo(waveLength(0), 4);
    expect(out[1][0]).toBeCloseTo(waveLength(100), 4);
    expect(out[2][0]).toBeCloseTo(waveLength(0), 4);
  });
});

describe('heightWavePhase', () => {
  it('starts at 0 and its slope is 1 / wavelength', async () => {
    const h = 0.01;
    const out = await run(
      linkWgsl(shading),
      `return vec4f(heightWavePhase(v.x), (heightWavePhase(v.x + ${h}) - heightWavePhase(v.x - ${h})) / ${2 * h}, 1.0 / heightWaveLength(v.x), 0.0);`,
      [[0], [10], [150]],
    );
    expect(out[0][0]).toBeCloseTo(0, 5);
    for (const [, slope, expected] of out.slice(1)) expect(slope).toBeCloseTo(expected, 2);
    const [half] = (await run(linkWgsl(shading), 'return vec4f(heightWavePhase(v.x));', [[zHalf]]))[0];
    expect(half).toBeCloseTo(0.5, 4);
  });
});

describe('heightWaveSway', () => {
  it('is zero at the origin at t = 0, bounded by the amplitudes, and varies over the city and time', async () => {
    const out = await run(linkWgsl(shading), 'return vec4f(heightWaveSway(v.xy, v.z));', [
      [0, 0, 0],
      [120, 0, 0],
      [0, 80, 0],
      [0, 0, 3],
      [-300, 210, 7],
    ]);
    const s = out.map((r) => r[0]);
    expect(s[0]).toBeCloseTo(0, 5);
    for (const x of s) expect(Math.abs(x)).toBeLessThanOrEqual(0.55 + 0.35 + 0.22 + 0.6 + 1e-5);
    for (const x of s.slice(1)) expect(Math.abs(x)).toBeGreaterThan(0.01);
  });
});

describe('heightWaveDuty', () => {
  it('gives wide bands low down, narrow ones high up, constant above the top', async () => {
    const out = await run(linkWgsl(shading), 'return vec4f(heightWaveDuty(v.x));', [[-5], [0], [75], [150], [300]]);
    expect(out.map((r) => r[0])).toEqual([-5, 0, 75, 150, 300].map((z) => expect.closeTo(waveDuty(z), 5)));
    expect(waveDuty(0)).toBeGreaterThan(waveDuty(150));
  });
});

describe('heightWaveFromCrest', () => {
  it('is 0 on a crest and 0.5 half a cycle above', async () => {
    const out = await run(linkWgsl(shading), 'return vec4f(heightWaveFromCrest(vec3f(0.0, 0.0, v.x), 0.0));', [[0], [zHalf], [0.25 * WAVE_BASE]]);
    expect(out.map((r) => r[0])).toEqual([0, 0.5, 0.25].map((x) => expect.closeTo(x, 4)));
  });
  it('is not a flat band: the same height sweeps crest to trough across the city and over time', async () => {
    const across = Array.from({ length: 40 }, (_, i) => [i * 10, i * 4, 0]);
    const overTime = Array.from({ length: 40 }, (_, i) => [0, 0, i * 0.25]);
    const body = 'return vec4f(heightWaveFromCrest(vec3f(v.x, v.y, 20.0), v.z));';
    for (const inputs of [across, overTime]) {
      const c = (await run(linkWgsl(shading), body, inputs)).map((r) => r[0]);
      expect(Math.max(...c) - Math.min(...c)).toBeGreaterThan(0.4);
    }
  });
});

describe('heightWaveSolid', () => {
  const body = 'return vec4f(select(0.0, 1.0, heightWaveSolid(vec3f(0.0, 0.0, v.x), 0.0, v.y)));';
  it('crests are solid, troughs are holes, unresolved stripes stay solid', async () => {
    const out = await run(linkWgsl(shading), body, [
      [0, 0.01],
      [zHalf, 0.01],
      [zHalf, 100],
    ]);
    expect(out.map((r) => r[0])).toEqual([1, 0, 1]);
  });
  it('the solid share of a cycle follows the duty: thick bands low, thin bands high', async () => {
    const n = 240;
    const share = async (z0: number) => {
      const zs = Array.from({ length: n }, (_, i) => [z0 + ((i + 0.5) / n) * WAVE_BASE, 0.01]);
      const out = await run(linkWgsl(shading), body, zs);
      zs.forEach(([z], i) => expect(out[i][0]).toBe(fromCrestAtOrigin(z) <= 0.5 * waveDuty(z) ? 1 : 0));
      return out.filter((r) => r[0] === 1).length / n;
    };
    const low = await share(0);
    const high = await share(150);
    expect(low).toBeCloseTo(waveDuty(3), 1);
    expect(high).toBeCloseTo(DUTY_HIGH, 1);
    expect(low).toBeGreaterThan(high);
  });
});

describe('shadeSilver', () => {
  const sun = 'vec4f(0.0, 0.0, 1.0, 1.0)';
  it('shows a bright sun highlight in the mirror direction', async () => {
    // normal up, sun overhead: viewer straight above sees the highlight, a grazing viewer does not
    const out = await run(linkWgsl(shading), `return vec4f(shadeSilver(vec3f(0.0, 0.0, 1.0), normalize(v.xyz), ${sun}, 1.0, 1.0), 0.0);`, [
      [0, 0, 1],
      [1, 0, 0.3],
    ]);
    expect(out[0][0]).toBeGreaterThan(out[1][0]);
    expect(out[0][0]).toBeGreaterThan(0.95);
  });
  it('is neutral grey and darker in shadow and at night', async () => {
    const body = 'return vec4f(shadeSilver(vec3f(1.0, 0.0, 0.0), vec3f(1.0, 0.0, 0.0), vec4f(0.6, 0.0, 0.8, v.y), v.x, 1.0), 0.0);';
    const [lit, shadow, night] = await run(linkWgsl(shading), body, [
      [1, 1],
      [0, 1],
      [1, 0],
    ]);
    expect(lit[0]).toBeGreaterThan(shadow[0]);
    expect(shadow[0]).toBeGreaterThan(night[0]);
    expect(night[0]).toBeGreaterThan(0);
    expect(Math.abs(lit[0] - lit[2])).toBeLessThan(0.1); // silver, not tinted
  });
});

// mirrors SWAY_AMP and the SWAY_* wavelengths in shading.wgsl
const SWAY_SLOPE = 2 * Math.PI * (0.55 / 260 + 0.35 / 150 + 0.22 / 95 + 0.6 / 420);
const STRIPE_SLOPE = Math.hypot(SWAY_SLOPE, 1 / waveLength(0) + (0.5 * (DUTY_LOW - DUTY_HIGH)) / DUTY_TOP);

describe('heightWaveSwaySlope', () => {
  it('bounds the numerical gradient of the sway', async () => {
    const [[slope]] = await run(linkWgsl(shading), 'return vec4f(heightWaveSwaySlope());', [[0]]);
    expect(slope).toBeCloseTo(SWAY_SLOPE, 5);
    const h = 0.05;
    const pts = Array.from({ length: 64 }, (_, i) => [(i * 37) % 500 - 250, (i * 53) % 400 - 200, i * 0.7]);
    const grads = await run(
      linkWgsl(shading),
      `let gx = (heightWaveSway(v.xy + vec2f(${h}, 0.0), v.z) - heightWaveSway(v.xy - vec2f(${h}, 0.0), v.z)) / ${2 * h};
       let gy = (heightWaveSway(v.xy + vec2f(0.0, ${h}), v.z) - heightWaveSway(v.xy - vec2f(0.0, ${h}), v.z)) / ${2 * h};
       return vec4f(length(vec2f(gx, gy)));`,
      pts,
    );
    for (const [g] of grads) expect(g).toBeLessThanOrEqual(slope * 1.01);
  });
});

describe('heightWaveStripeDistance', () => {
  const body = 'return vec4f(heightWaveStripeDistance(v.xyz, v.w));';
  it('is negative inside the bands, positive in the gaps, matching the band edges', async () => {
    // origin, t = 0: no sway, so the phase is z / wavelength
    const out = await run(linkWgsl(shading), body, [
      [0, 0, 0, 0],
      [0, 0, zHalf, 0],
    ]);
    expect(out[0][0]).toBeCloseTo(-0.4 / STRIPE_SLOPE, 3);
    expect(out[1][0]).toBeCloseTo((0.5 - 0.5 * waveDuty(zHalf)) / STRIPE_SLOPE, 3);
    const zs = Array.from({ length: 200 }, (_, i) => [0, 0, i * 0.97, 0]);
    const d = await run(linkWgsl(shading), body, zs);
    zs.forEach(([, , z], i) => {
      const edge = fromCrestAtOrigin(z) - 0.5 * waveDuty(z);
      if (Math.abs(edge) > 0.01) expect(Math.sign(d[i][0])).toBe(Math.sign(edge));
    });
  });
  it('never changes faster than the distance moved (safe for sphere tracing)', async () => {
    const pts = Array.from({ length: 128 }, (_, i) => [(i * 37) % 300 - 150, (i * 53) % 200 - 100, 1 + ((i * 7) % 90), (i % 5) * 1.3]);
    const step = [0.3, -0.2, 0.25];
    const len = Math.hypot(...step);
    const a = await run(linkWgsl(shading), body, pts);
    const b = await run(linkWgsl(shading), body, pts.map(([x, y, z, t]) => [x + step[0], y + step[1], z + step[2], t]));
    a.forEach(([da], i) => expect(Math.abs(da - b[i][0])).toBeLessThanOrEqual(len * 1.001));
  });
});

describe('waveShellDistance', () => {
  it('is a thin shell around the surface where the stripes are solid, open where they are not', async () => {
    const out = await run(linkWgsl(shading), 'return vec4f(waveShellDistance(vec3f(0.0, 0.0, v.x), v.y, 0.0, 0.5));', [
      [0, 0], // on the surface, crest
      [0, -3], // deep inside the building, crest: hollow
      [0, 2], // outside
      [zHalf, 0], // on the surface, trough: opening
    ]);
    expect(out[0][0]).toBeCloseTo(-0.5, 4);
    expect(out[1][0]).toBeCloseTo(2.5, 4);
    expect(out[2][0]).toBeCloseTo(1.5, 4);
    expect(out[3][0]).toBeGreaterThan(0.5);
  });
});

describe('sceneShape (plain)', () => {
  it('passes the baked distance through and cuts no holes', async () => {
    const out = await run(linkWgsl(sceneShape), 'return vec4f(shapeDistance(v.xyz, v.w), select(0.0, 1.0, SHAPE_CUTS_HOLES), SHADOW_SHARPNESS, 0.0);', [[3, 4, 5, -1.5]]);
    expect(out[0].slice(0, 3)).toEqual([-1.5, 0, 8]); // the original soft shadow
  });
});
