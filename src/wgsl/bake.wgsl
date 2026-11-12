// Bake pass: signed, truncated distance and nearest-triangle palette index at every sample
// of the slots in this batch. Slots may have different voxel sizes (adaptive refinement), so
// each slot has a descriptor (min corner, voxel) and distances are written normalised by the
// slot's truncation distance (truncationVoxels * voxel) to [-1, 1].
// Sign comes from the face normal of the nearest triangle, choosing among equally near
// triangles the one whose plane best faces the sample (robust at edges and corners).
struct BakeParams {
  truncationVoxels: f32,
  slotBase: u32,
  slotCount: u32,
  groupsX: u32,
};

@group(0) @binding(0) var<uniform> bake: BakeParams;
@group(0) @binding(1) var<storage, read> sceneTris: array<f32>;
@group(0) @binding(2) var<storage, read> slotDescs: array<vec4f>;
@group(0) @binding(3) var<storage, read> slotTriOffsets: array<u32>;
@group(0) @binding(4) var<storage, read> slotTriIndices: array<u32>;
@group(0) @binding(5) var<storage, read_write> bakeOut: array<f32>;
@group(0) @binding(6) var<storage, read> slotTriPalette: array<u32>;
@group(0) @binding(7) var<storage, read_write> bakeIdOut: array<u32>;

struct BakeSample {
  d: f32,
  paletteIndex: u32,
};

fn bakeTri(i: u32, k: u32) -> vec3f {
  let o = i * 9u + k * 3u;
  return vec3f(sceneTris[o], sceneTris[o + 1u], sceneTris[o + 2u]);
}

fn bakeSampleAt(p: vec3f, slot: u32, voxel: f32) -> BakeSample {
  var bestD = 1e30;
  var bestAlign = 0.0;
  var bestRef = 0xffffffffu;
  let eps = 1e-3 * voxel;
  let start = slotTriOffsets[slot];
  let end = slotTriOffsets[slot + 1u];
  for (var i = start; i < end; i++) {
    let ti = slotTriIndices[i];
    let a = bakeTri(ti, 0u);
    let b = bakeTri(ti, 1u);
    let c = bakeTri(ti, 2u);
    let q = closestPointTriangle(p, a, b, c);
    let d = distance(p, q);
    let n = cross(b - a, c - a);
    let nl = length(n);
    if (nl <= 0.0) { continue; }
    let align = dot(p - q, n / nl) / max(d, 1e-6);
    if (d < bestD - eps) {
      bestD = d;
      bestAlign = align;
      bestRef = i;
    } else if (d <= bestD + eps && abs(align) > abs(bestAlign)) {
      bestD = min(bestD, d);
      bestAlign = align;
      bestRef = i;
    }
  }
  let truncation = bake.truncationVoxels * voxel;
  let mag = min(bestD, truncation) / truncation;
  var pal = 0u;
  if (bestRef != 0xffffffffu) { pal = slotTriPalette[bestRef]; }
  return BakeSample(select(mag, -mag, bestAlign < 0.0), pal);
}

@compute @workgroup_size(64)
fn bakeMain(@builtin(global_invocation_id) gid: vec3u) {
  let idx = gid.x + gid.y * bake.groupsX * 64u;
  let local = idx / 729u;
  if (local >= bake.slotCount) { return; }
  let s = idx % 729u;
  let sample = vec3u(s % 9u, (s / 9u) % 9u, s / 81u);
  let slot = bake.slotBase + local;
  let desc = slotDescs[slot];
  let p = desc.xyz + vec3f(sample) * desc.w;
  let r = bakeSampleAt(p, slot, desc.w);
  bakeOut[idx] = r.d;
  bakeIdOut[idx] = r.paletteIndex;
}
