// Single sparse brick grid (one bake): cell lookup and exact triangle queries.
// Requires globals: scene, brickTable, sceneTris, sceneTriInfo, slotTriOffsets, slotTriIndices.

// Outside the grid behaves like an empty brick next to occupied space (skip to the cell exit only).
fn brickEntryAt(c: vec3i) -> u32 {
  let idx = brickLinearIndex(c, scene.dims);
  if (idx < 0) { return BRICK_EMPTY_FLAG | 1u; }
  return brickTable[u32(idx)];
}

fn locateCell(p: vec3f) -> Cell {
  let c = brickCoordOf(p, scene.gridOrigin, scene.brickWorld);
  let bmin = scene.gridOrigin + vec3f(c) * scene.brickWorld;
  let e = brickEntryAt(c);
  if (brickIsEmpty(e)) { return Cell(bmin, scene.brickWorld, scene.voxelSize, 0u, true, brickEmptyDistance(e)); }
  if (!brickIsRefined(e)) { return Cell(bmin, scene.brickWorld, scene.voxelSize, e, false, 0u); }
  let r = scene.refineFactor;
  let cw = scene.brickWorld / f32(r);
  let cv = scene.voxelSize / f32(r);
  let cc = childIndexOf(p - bmin, cw, r);
  let ce = brickTable[brickChildBase(e) + (cc.z * r + cc.y) * r + cc.x];
  let cmin = bmin + vec3f(cc) * cw;
  if (brickIsEmpty(ce)) { return Cell(cmin, cw, cv, 0u, true, 1u); }
  return Cell(cmin, cw, cv, ce, false, 0u);
}

// Closest ray/triangle intersection among the triangles binned in a slot.
fn intersectSlot(ro: vec3f, rd: vec3f, slot: u32) -> TriHit {
  var best = TriHit(1e30, 0xffffffffu);
  let start = slotTriOffsets[slot];
  let end = slotTriOffsets[slot + 1u];
  for (var i = start; i < end; i++) {
    let ti = slotTriIndices[i];
    let t = rayTriangle(ro, rd, sceneTri(ti, 0u), sceneTri(ti, 1u), sceneTri(ti, 2u));
    if (t > 0.0 && t < best.t) { best = TriHit(t, ti); }
  }
  return best;
}

fn triNormal(ti: u32) -> vec3f {
  let a = sceneTri(ti, 0u);
  return normalize(cross(sceneTri(ti, 1u) - a, sceneTri(ti, 2u) - a));
}

fn triInfoOf(ti: u32) -> u32 { return sceneTriInfo[ti]; }
