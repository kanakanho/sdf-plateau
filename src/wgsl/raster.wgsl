// Reference rasteriser for the city mesh (draws 3 * triCount vertices, no vertex buffers).
// Requires globals: frame, sceneTris, sceneTriInfo, buildingAttrs.
struct RasterOut {
  @builtin(position) pos: vec4f,
  @location(0) @interpolate(flat) normal: vec3f,
  @location(1) @interpolate(flat) info: u32,
  @location(2) world: vec3f,
};

@vertex
fn rasterVs(@builtin(vertex_index) vi: u32) -> RasterOut {
  let tri = vi / 3u;
  let p = sceneTri(tri, vi % 3u);
  var out: RasterOut;
  out.pos = frame.viewProj * vec4f(p, 1.0);
  let a = sceneTri(tri, 0u);
  out.normal = normalize(cross(sceneTri(tri, 1u) - a, sceneTri(tri, 2u) - a));
  out.info = sceneTriInfo[tri];
  out.world = p;
  return out;
}

struct SurfaceOut {
  @location(0) color: vec4f,
  @location(1) id: u32,
};

@fragment
fn rasterFs(in: RasterOut, @builtin(front_facing) front: bool) -> SurfaceOut {
  let building = in.info >> 3u;
  let n = select(-in.normal, in.normal, front);
  var albedo = albedoFor(frame.colorMode, in.info & 7u, buildingAttrs[building]);
  let footprint = length(fwidth(in.world));
  if (frame.selected == building + 1u) { albedo = mix(albedo, vec3f(1.0, 0.85, 0.2), 0.6); }
  var c = shadeSurface(albedo, n, frame.sunDir, 1.0, 1.0);
  if (frame.colorMode == COLOR_MODE_WAVES) {
    // trough stripes are holes (back faces are drawn, so the far walls show through)
    if (!heightWaveSolid(in.world, frame.viewport.z, footprint)) { discard; }
    let eye = rayFromNdc(frame.invViewProj, vec2f(0.0)).origin;
    c = shadeSilver(n, normalize(eye - in.world), frame.sunDir, 1.0, 1.0);
    if (frame.selected == building + 1u) { c = mix(c, vec3f(1.0, 0.85, 0.2), 0.6); }
  }
  return SurfaceOut(vec4f(c, 1.0), building + 1u);
}
