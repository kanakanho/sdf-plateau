// Scene queries shared by the single-grid (sdfScene) and tiled (sdfTiledScene) variants.
// Requires globals: scene (SceneParams), sdfAtlas, sdfSampler, idAtlas, slotPalettes, and from the
// variant: locateCell, intersectSlot, triNormal, triInfoOf.

// Leaf cell of the two-level brick grid containing a point: a coarse brick, or a child of a
// refined brick. Empty cells carry a Chebyshev skip distance in units of their own size.
struct Cell {
  bmin: vec3f,
  world: f32,
  voxel: f32,
  slot: u32,
  empty: bool,
  skip: u32,
};

fn cellTruncation(cell: Cell) -> f32 { return scene.truncation * cell.voxel / scene.voxelSize; }

// Lower bound of the distance to any surface from inside an empty cell.
fn cellEmptyBound(cell: Cell) -> f32 { return f32(max(cell.skip, 1u) - 1u) * cell.world + cell.voxel; }

fn sampleCellSdf(p: vec3f, cell: Cell) -> f32 {
  let local = (p - cell.bmin) / cell.voxel;
  let uvw = atlasUvw(local, atlasSlotOrigin(cell.slot, scene.slotsX, scene.slotsY), scene.atlasSize);
  return decodeSdf(textureSampleLevel(sdfAtlas, sdfSampler, uvw, 0.0).r, cellTruncation(cell));
}

// Distance to the nearest surface: x = conservative distance (safe for stepping),
// y = 1 when x is the true distance (inside the truncation band of a baked cell), else 0.
// Empty cells only know an unsigned lower bound, so deep building interiors read as positive;
// rays coming from outside always cross a baked cell first, so marching is unaffected.
fn sceneDistanceInfo(p: vec3f) -> vec2f {
  let gmin = scene.gridOrigin;
  let gmax = scene.gridOrigin + vec3f(scene.dims) * scene.brickWorld;
  let outside = max(max(gmin - p, p - gmax), vec3f(0.0));
  if (any(outside > vec3f(0.0))) { return vec2f(length(outside) + scene.voxelSize, 0.0); }
  let cell = locateCell(p);
  if (cell.empty) { return vec2f(cellEmptyBound(cell), 0.0); }
  let d = sampleCellSdf(p, cell);
  return vec2f(d, select(0.0, 1.0, abs(d) < 0.98 * cellTruncation(cell)));
}

fn sceneDistance(p: vec3f) -> f32 {
  return sceneDistanceInfo(p).x;
}

struct TriHit {
  t: f32,
  tri: u32,
};

// Surface id (triInfo = building << 3 | surface type) from the baked id volume, without touching
// triangles: among the 8 samples around p, take the one closest to the surface (and to p).
// Returns 0xffffffff in empty space.
fn sceneInfoAt(p: vec3f) -> u32 {
  let cell = locateCell(p);
  if (cell.empty) { return 0xffffffffu; }
  let local = clamp((p - cell.bmin) / cell.voxel, vec3f(0.0), vec3f(8.0));
  let base = vec3u(floor(min(local, vec3f(7.999))));
  let o = atlasSlotOrigin(cell.slot, scene.slotsX, scene.slotsY);
  let truncation = cellTruncation(cell);
  var best = 1e30;
  var bestIdx = 0u;
  for (var k = 0u; k < 8u; k++) {
    let corner = base + vec3u(k & 1u, (k >> 1u) & 1u, (k >> 2u) & 1u);
    let texel = vec3i(o + corner);
    let d = abs(decodeSdf(textureLoad(sdfAtlas, texel, 0).r, truncation));
    let score = d + 0.5 * cell.voxel * distance(local, vec3f(corner));
    if (score < best) {
      best = score;
      bestIdx = textureLoad(idAtlas, texel, 0).r;
    }
  }
  return slotPalettes[slotPalettes[cell.slot] + bestIdx];
}
