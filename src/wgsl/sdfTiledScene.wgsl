// Tiled sparse brick grid (streamed LOD1 areas): the area is a 2D grid of square tiles, each baked
// on its own. tileTable maps a tile to its resident index (or TILE_NOT_RESIDENT); a resident tile
// owns tiling.tileEntries consecutive entries of brickTable (x-fastest, tileBricks² × dims.z).
// Brick entries hold global atlas slots. No triangles are kept on the GPU, so the exact
// intersection path reports no hit.
// Requires globals: scene (SceneParams over the whole area), tiling (TilingParams), tileTable, brickTable.
const TILE_NOT_RESIDENT: u32 = 0xffffffffu;

struct TilingParams {
  tileBricks: u32,
  tilesX: u32,
  tilesY: u32,
  tileEntries: u32,
};

// Bricks between a brick (tile-local xy coordinate) and the nearest tile edge. Empty-space skips
// are capped by this, since a tile's distance transform knows nothing about its neighbours.
fn tileEdgeBricks(lc: vec2i, tileBricks: i32) -> u32 {
  let far = vec2i(tileBricks - 1) - lc;
  return u32(max(min(min(lc.x, far.x), min(lc.y, far.y)), 0));
}

fn locateCell(p: vec3f) -> Cell {
  let c = brickCoordOf(p, scene.gridOrigin, scene.brickWorld);
  let bmin = scene.gridOrigin + vec3f(c) * scene.brickWorld;
  if (brickLinearIndex(c, scene.dims) < 0) { return Cell(bmin, scene.brickWorld, scene.voxelSize, 0u, true, 1u); }
  let t = i32(tiling.tileBricks);
  let tc = c.xy / t;
  let lc = c.xy - tc * t;
  let edgeSkip = tileEdgeBricks(lc, t) + 1u;
  let r = tileTable[u32(tc.y) * tiling.tilesX + u32(tc.x)];
  if (r == TILE_NOT_RESIDENT) { return Cell(bmin, scene.brickWorld, scene.voxelSize, 0u, true, edgeSkip); }
  let tb = tiling.tileBricks;
  let e = brickTable[r * tiling.tileEntries + (u32(c.z) * tb + u32(lc.y)) * tb + u32(lc.x)];
  if (brickIsEmpty(e)) {
    return Cell(bmin, scene.brickWorld, scene.voxelSize, 0u, true, min(brickEmptyDistance(e), edgeSkip));
  }
  return Cell(bmin, scene.brickWorld, scene.voxelSize, e, false, 0u);
}

fn intersectSlot(ro: vec3f, rd: vec3f, slot: u32) -> TriHit { return TriHit(1e30, 0xffffffffu); }

fn triNormal(ti: u32) -> vec3f { return vec3f(0.0, 0.0, 1.0); }

fn triInfoOf(ti: u32) -> u32 { return 0xffffffffu; }
