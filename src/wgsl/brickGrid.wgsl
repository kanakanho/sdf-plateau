// Sparse brick grid addressing.
// Indirection entry: bit31 set => empty brick, low bits = Chebyshev distance (in bricks)
// to the nearest occupied brick; bit30 set => refined brick, low 30 bits = index of its first
// child entry in the same table; otherwise the value is the atlas slot index.
const BRICK_EMPTY_FLAG: u32 = 0x80000000u;
const BRICK_REFINED_FLAG: u32 = 0x40000000u;
const SAMPLES_PER_BRICK_AXIS: u32 = 9u; // 8 cells + shared corner

fn brickCoordOf(p: vec3f, gridOrigin: vec3f, brickWorld: f32) -> vec3i {
  return vec3i(floor((p - gridOrigin) / brickWorld));
}

// Linear index of a brick, or -1 when outside the grid.
fn brickLinearIndex(c: vec3i, dims: vec3u) -> i32 {
  if (any(c < vec3i(0)) || any(vec3u(c) >= dims)) { return -1; }
  return i32((u32(c.z) * dims.y + u32(c.y)) * dims.x + u32(c.x));
}

fn brickIsEmpty(entry: u32) -> bool { return (entry & BRICK_EMPTY_FLAG) != 0u; }
fn brickEmptyDistance(entry: u32) -> u32 { return entry & ~BRICK_EMPTY_FLAG; }
fn brickIsRefined(entry: u32) -> bool { return !brickIsEmpty(entry) && (entry & BRICK_REFINED_FLAG) != 0u; }
fn brickChildBase(entry: u32) -> u32 { return entry & ~(BRICK_EMPTY_FLAG | BRICK_REFINED_FLAG); }

// Index of the child (x-fastest) containing local position q (relative to the parent min corner).
fn childIndexOf(q: vec3f, childWorld: f32, r: u32) -> vec3u {
  return vec3u(clamp(vec3i(floor(q / childWorld)), vec3i(0), vec3i(i32(r) - 1)));
}

// Slot origin (in samples) inside the 3D atlas. Slots are laid out x-fastest.
fn atlasSlotOrigin(slot: u32, slotsX: u32, slotsY: u32) -> vec3u {
  let sx = slot % slotsX;
  let sy = (slot / slotsX) % slotsY;
  let sz = slot / (slotsX * slotsY);
  return vec3u(sx, sy, sz) * SAMPLES_PER_BRICK_AXIS;
}

// Normalised texture coordinate for filtering inside a slot.
// local = position relative to the brick min corner, in voxels (0..8).
fn atlasUvw(local: vec3f, slotOrigin: vec3u, atlasSize: vec3f) -> vec3f {
  let l = clamp(local, vec3f(0.0), vec3f(8.0));
  return (vec3f(slotOrigin) + l + 0.5) / atlasSize;
}

// Distance from p (inside the box) to the box boundary along rd.
fn exitDistance(p: vec3f, rd: vec3f, bmin: vec3f, bmax: vec3f) -> f32 {
  let inv = 1.0 / rd;
  let t0 = (bmin - p) * inv;
  let t1 = (bmax - p) * inv;
  let tmax = max(t0, t1);
  return max(min(min(tmax.x, tmax.y), tmax.z), 0.0);
}
