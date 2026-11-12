// Packs baked samples of a run of slot rows into 8-bit texel rows (4 texels per u32,
// rows padded to bytesPerRow) for copyBufferToTexture.
// mode 0: f32 distances -> r8unorm codes; mode 1: u32 palette indices -> r8uint.
struct PackParams {
  width: u32,        // texels per row (slotsX * 9)
  rows: u32,         // texel rows in the region (slot rows * 9)
  wordsPerRow: u32,  // bytesPerRow / 4
  slotCount: u32,    // valid slots in this region
  truncation: f32,
  slotsX: u32,
  groupsX: u32,
  mode: u32,
};

@group(0) @binding(0) var<uniform> pk: PackParams;
@group(0) @binding(1) var<storage, read> packIn: array<f32>;
@group(0) @binding(2) var<storage, read_write> packOut: array<u32>;
@group(0) @binding(3) var<storage, read> packIdIn: array<u32>;

fn texelValue(x: u32, y: u32, z: u32) -> u32 {
  if (x >= pk.width) { return 0u; }
  let slot = (y / 9u) * pk.slotsX + x / 9u;
  if (slot >= pk.slotCount) { return select(255u, 0u, pk.mode == 1u); }
  let s = (z * 9u + (y % 9u)) * 9u + (x % 9u);
  if (pk.mode == 1u) { return packIdIn[slot * 729u + s] & 255u; }
  let v = encodeSdf(packIn[slot * 729u + s], pk.truncation);
  return u32(round(v * 255.0));
}

@compute @workgroup_size(64)
fn packMain(@builtin(global_invocation_id) gid: vec3u) {
  let w = gid.x + gid.y * pk.groupsX * 64u;
  let total = pk.wordsPerRow * pk.rows * 9u;
  if (w >= total) { return; }
  let row = w / pk.wordsPerRow;      // over rows * 9 slices
  let y = row % pk.rows;
  let z = row / pk.rows;
  let x0 = (w % pk.wordsPerRow) * 4u;
  packOut[w] = texelValue(x0, y, z) | (texelValue(x0 + 1u, y, z) << 8u)
    | (texelValue(x0 + 2u, y, z) << 16u) | (texelValue(x0 + 3u, y, z) << 24u);
}
