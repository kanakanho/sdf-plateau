// Full-screen SDF ray marcher over the sparse brick atlas.
// Requires globals: frame, buildingAttrs + sdfScene bindings.
struct FsIn {
  @builtin(position) pos: vec4f,
};

@vertex
fn fullscreenVs(@builtin(vertex_index) vi: u32) -> FsIn {
  let uv = vec2f(f32((vi << 1u) & 2u), f32(vi & 2u));
  return FsIn(vec4f(uv * 2.0 - 1.0, 0.0, 1.0));
}

struct MarchResult {
  t: f32,
  steps: u32,
  hit: bool,
  slot: u32,
};

fn gridMax() -> vec3f { return scene.gridOrigin + vec3f(scene.dims) * scene.brickWorld; }

// Sphere tracing with empty-brick skipping. side = 1 marches through open space to the next
// entry surface; side = -1 marches through a building's interior to its exit surface (used when a
// see-through hole lets the ray pass a surface).
fn march(ro: vec3f, rd: vec3f, tStart: f32, tEnd: f32, side: f32) -> MarchResult {
  var t = tStart;
  var steps = 0u;
  loop {
    if (steps >= frame.maxSteps || t > tEnd) { break; }
    steps++;
    let p = ro + rd * t;
    let cell = locateCell(p);
    if (cell.empty) {
      let skip = max(f32(max(cell.skip, 1u) - 1u) * cell.world, exitDistance(p, rd, cell.bmin, cell.bmin + cell.world));
      t += skip + 1e-3 * cell.voxel;
      continue;
    }
    let d = side * shapeDistance(p, sampleCellSdf(p, cell));
    if (d < 0.02 * cell.voxel + t * 2e-5) {
      return MarchResult(t, steps, true, cell.slot);
    }
    t += max(d, 0.05 * cell.voxel);
  }
  return MarchResult(t, steps, false, 0u);
}

// Scene distance through the shape hook (sceneShape*.wgsl). Lower bounds stay lower bounds.
fn shapedDistanceInfo(p: vec3f) -> vec2f {
  let di = sceneDistanceInfo(p);
  return vec2f(shapeDistance(p, di.x), di.y);
}

fn shapedDistance(p: vec3f) -> f32 { return shapedDistanceInfo(p).x; }

fn sdfNormal(p: vec3f) -> vec3f {
  let h = 0.5 * locateCell(p).voxel;
  let k = vec2f(1.0, -1.0);
  return normalize(
    k.xyy * shapedDistance(p + k.xyy * h) + k.yyx * shapedDistance(p + k.yyx * h) +
    k.yxy * shapedDistance(p + k.yxy * h) + k.xxx * shapedDistance(p + k.xxx * h));
}

// Soft shadow towards the sun (Quilez); 1 = fully lit.
// Only true distances shape the penumbra; conservative bounds are used for stepping only.
fn softShadow(p: vec3f, l: vec3f) -> f32 {
  var res = 1.0;
  var t = 0.5 * scene.voxelSize;
  let top = gridMax().z;
  for (var i = 0; i < 96; i++) {
    let q = p + l * t;
    if (q.z > top) { break; }
    let di = shapedDistanceInfo(q);
    if (di.x < 0.01) { return 0.0; }
    if (di.y > 0.5) { res = min(res, SHADOW_SHARPNESS * di.x / t); }
    t += clamp(di.x, 0.1, 30.0);
    if (t > 600.0) { break; }
  }
  return clamp(res, 0.0, 1.0);
}

// Height-wave shadow: sunlight passes the trough stripes (holes) just like the view ray, so the
// shadow repeats the wave pattern. Hard-edged; 1 = lit. The march alternates between open space
// and building interiors, starting on whichever side p is.
fn waveShadow(p: vec3f, l: vec3f) -> f32 {
  let span = rayBox(p, l, vec3f(scene.gridOrigin.xy, min(scene.gridOrigin.z, -0.01)), gridMax());
  var side = select(-1.0, 1.0, sceneDistance(p) >= 0.0);
  var t = max(span.x, 0.0);
  for (var layer = 0; layer < 6; layer++) {
    let m = march(p, l, t, span.y, side);
    if (!m.hit) { return 1.0; }
    let q = p + l * m.t;
    if (heightWaveSolid(q, frame.viewport.z, 0.0)) { return 0.0; }
    side = -side;
    t = m.t + 0.1 * locateCell(q).voxel + m.t * 1e-4;
  }
  return 0.0;
}

// Sun visibility for the current colour mode.
fn sunVisibility(p: vec3f, l: vec3f) -> f32 {
  // with SHAPE_CUTS_HOLES the openings are in the distance field, so the soft shadow sees them
  if (frame.colorMode == COLOR_MODE_WAVES && !SHAPE_CUTS_HOLES) { return waveShadow(p, l); }
  return softShadow(p, l);
}

// Ambient occlusion from up to 5 samples along the normal (unbaked space counts as open).
fn ambientOcclusion(p: vec3f, n: vec3f) -> f32 {
  var occ = 0.0;
  var w = 1.0;
  for (var i = 1; i <= 5; i++) {
    let h = f32(i) * 1.2;
    let di = shapedDistanceInfo(p + n * h);
    let d = select(h, min(di.x, h), di.y > 0.5);
    occ += (h - d) * w;
    w *= 0.6;
  }
  return clamp(1.0 - occ * 0.18, 0.0, 1.0);
}

struct SurfaceOut {
  @location(0) color: vec4f,
  @location(1) id: u32,
};

@fragment
fn sdfFs(in: FsIn) -> SurfaceOut {
  let ndc = vec2f(in.pos.x / frame.viewport.x * 2.0 - 1.0, 1.0 - in.pos.y / frame.viewport.y * 2.0);
  let ray = rayFromNdc(frame.invViewProj, ndc);
  let gmin = scene.gridOrigin;
  let gmax = gridMax();
  let span = rayBox(ray.origin, ray.dir, vec3f(gmin.xy, min(gmin.z, -0.01)), gmax);
  // ground plane z = 0 caps the march
  var tGround = 1e30;
  if (ray.dir.z < 0.0) { tGround = -ray.origin.z / ray.dir.z; }
  let tStart = max(span.x, 0.0);
  let tEnd = min(span.y, tGround);

  var m = MarchResult(tEnd, 0u, false, 0u);
  // metres per pixel at distance t = t * angle between neighbouring pixel rays
  let pixelAngle = length(rayFromNdc(frame.invViewProj, ndc + vec2f(0.0, 2.0 / frame.viewport.y)).dir - ray.dir);
  let waves = frame.colorMode == COLOR_MODE_WAVES;
  if (span.x <= span.y && tStart < tEnd) {
    m = march(ray.origin, ray.dir, tStart, tEnd, 1.0);
    // height waves: trough stripes are holes, so pass the surface and march on to the next one
    // (alternately a building's far wall from inside and the next building from outside)
    var side = 1.0;
    for (var layer = 0; layer < 6; layer++) {
      if (!waves || SHAPE_CUTS_HOLES || !m.hit) { break; }
      if (heightWaveSolid(ray.origin + ray.dir * m.t, frame.viewport.z, m.t * pixelAngle)) { break; }
      side = -side;
      let nudge = 0.1 * locateCell(ray.origin + ray.dir * m.t).voxel + m.t * 1e-4;
      m = march(ray.origin, ray.dir, m.t + nudge, tEnd, side);
    }
  }

  if (frame.colorMode == 4u) {
    let a = select(0.0, 0.85, m.steps > 0u);
    return SurfaceOut(vec4f(stepsColor(f32(m.steps), f32(frame.maxSteps)) * a, a), 0u);
  }

  if (!m.hit) {
    // ground: shadow catcher only
    if (!hasFlag(frame.flags, FLAG_GROUND) || tGround >= 1e29 || frame.sunDir.w <= 0.0) { return SurfaceOut(vec4f(0.0), 0u); }
    let g = ray.origin + ray.dir * tGround;
    if (any(g.xy < gmin.xy) || any(g.xy > gmax.xy)) { return SurfaceOut(vec4f(0.0), 0u); }
    var vis = 1.0;
    if (hasFlag(frame.flags, FLAG_SHADOWS)) { vis = sunVisibility(g + vec3f(0.0, 0.0, 0.05), frame.sunDir.xyz); }
    var ao = 1.0;
    if (hasFlag(frame.flags, FLAG_AO)) { ao = ambientOcclusion(g, vec3f(0.0, 0.0, 1.0)); }
    let darkness = clamp((1.0 - vis) * 0.45 * frame.sunDir.w + (1.0 - ao) * 0.5, 0.0, 0.75);
    return SurfaceOut(vec4f(0.05, 0.07, 0.12, 1.0) * darkness, 0u);
  }

  var p = ray.origin + ray.dir * m.t;
  var n = vec3f(0.0);
  var info = 0xffffffffu;
  // (the triangles know nothing of shaped openings)
  if (hasFlag(frame.flags, FLAG_REFINE) && !SHAPE_CUTS_HOLES) {
    // optional: exact intersection with the triangles binned in this brick
    let back = 1.5 * scene.voxelSize;
    let h = intersectSlot(p - ray.dir * back, ray.dir, m.slot);
    if (h.tri != 0xffffffffu && h.t < 3.0 * back) {
      p = p - ray.dir * back + ray.dir * h.t;
      n = triNormal(h.tri);
      info = triInfoOf(h.tri);
    }
  }
  var surfaceType = info & 7u;
  if (info == 0xffffffffu) {
    // pure SDF: normal from the distance gradient, building id from the baked id volume,
    // roof/wall/ground from the normal
    n = sdfNormal(p);
    info = sceneInfoAt(p);
    surfaceType = surfaceTypeFromNormal(info & 7u, n);
  }
  if (info == 0xffffffffu) { return SurfaceOut(vec4f(0.0), 0u); }
  if (dot(n, ray.dir) > 0.0) { n = -n; }

  let building = info >> 3u;
  var albedo = albedoFor(frame.colorMode, surfaceType, buildingAttrs[building]);
  if (frame.selected == building + 1u) { albedo = mix(albedo, vec3f(1.0, 0.85, 0.2), 0.6); }
  var vis = 1.0;
  if (hasFlag(frame.flags, FLAG_SHADOWS) && frame.sunDir.w > 0.0 && dot(n, frame.sunDir.xyz) > 0.0) {
    vis = sunVisibility(p + n * (0.3 * scene.voxelSize), frame.sunDir.xyz);
  }
  var ao = 1.0;
  if (hasFlag(frame.flags, FLAG_AO)) { ao = ambientOcclusion(p + n * 0.05, n); }
  var c = shadeSurface(albedo, n, frame.sunDir, vis, ao);
  if (waves) {
    c = shadeSilver(n, -ray.dir, frame.sunDir, vis, ao);
    if (frame.selected == building + 1u) { c = mix(c, vec3f(1.0, 0.85, 0.2), 0.6); }
  }
  return SurfaceOut(vec4f(c, 1.0), building + 1u);
}
