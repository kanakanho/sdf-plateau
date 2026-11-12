/** Per-frame uniforms and helpers shared by the raster and SDF renderers. */
import type { BuildingAttributes } from '../data/buildings';
import { usageCategory } from '../data/buildings';
import { type Mat4, fromValues, multiply } from '../geo/mat4';

export const ColorMode = { Surface: 0, Height: 1, Usage: 2, Year: 3, Steps: 4 } as const;
export type ColorModeCode = (typeof ColorMode)[keyof typeof ColorMode];

export const RenderFlag = { Shadows: 1, Ao: 2, Refine: 4, Ground: 8 } as const;

export type FrameInput = {
  readonly viewProj: ArrayLike<number>;
  readonly invViewProj: ArrayLike<number>;
  readonly sunDir: readonly [number, number, number];
  readonly sunIntensity: number;
  readonly viewport: readonly [number, number];
  readonly time: number;
  readonly colorMode: number;
  readonly flags: number;
  readonly selected: number;
  readonly maxSteps: number;
};

export const FRAME_BYTES = 176;

export const packFrameParams = (f: FrameInput): ArrayBuffer => {
  const buf = new ArrayBuffer(FRAME_BYTES);
  const fl = new Float32Array(buf);
  const u = new Uint32Array(buf);
  fl.set(Array.from(f.viewProj), 0);
  fl.set(Array.from(f.invViewProj), 16);
  fl.set(f.sunDir, 32);
  fl[35] = f.sunIntensity;
  fl[36] = f.viewport[0];
  fl[37] = f.viewport[1];
  fl[38] = f.time;
  u[40] = f.colorMode;
  u[41] = f.flags;
  u[42] = f.selected;
  u[43] = f.maxSteps;
  return buf;
};

/** Remaps GL clip z ([-w, w]) to WebGPU clip z ([0, w]): z' = 0.5 z + 0.5 w. */
export const GL_TO_WEBGPU_CLIP: Mat4 = fromValues([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0.5, 0, 0, 0, 0.5, 1]);

export const glToWebGpuClip = (m: ArrayLike<number>): Mat4 => multiply(GL_TO_WEBGPU_CLIP, m);

/** Building attributes for the GPU: vec4(height, usage category, year, lod). */
export const buildingAttributeArray = (
  buildings: readonly BuildingAttributes[],
  bboxHeights?: ArrayLike<number>,
): Float32Array => {
  const out = new Float32Array(Math.max(1, buildings.length) * 4);
  buildings.forEach((b, i) => {
    out[i * 4] = b.measuredHeight ?? bboxHeights?.[i] ?? 0;
    out[i * 4 + 1] = usageCategory(b.usage);
    out[i * 4 + 2] = b.yearOfConstruction ?? 0;
    out[i * 4 + 3] = b.lod;
  });
  return out;
};

/** Max z per building from the mesh ranges (fallback height). */
export const buildingTopHeights = (positions: Float32Array, buildingRanges: Uint32Array): Float32Array => {
  const n = buildingRanges.length / 2;
  const out = new Float32Array(n);
  for (let b = 0; b < n; b++) {
    let top = 0;
    const start = buildingRanges[b * 2];
    const end = start + buildingRanges[b * 2 + 1];
    for (let t = start; t < end; t++) for (let k = 2; k < 9; k += 3) top = Math.max(top, positions[t * 9 + k]);
    out[b] = top;
  }
  return out;
};
