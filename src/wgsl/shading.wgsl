// Material and lighting shared by the raster and SDF renderers.
// attrs = (height m, usage category, construction year, lod)
fn albedoFor(mode: u32, surfaceType: u32, attrs: vec4f) -> vec3f {
  switch mode {
    case 1u: { return heightColor(attrs.x); }
    case 2u: { return usageColor(u32(attrs.y)); }
    case 3u: { return yearColor(attrs.z); }
    default: { return surfaceColor(surfaceType); }
  }
}

// Simple outdoor lighting: sun (with visibility) + sky hemisphere ambient, in linear space.
fn shadeSurface(albedo: vec3f, n: vec3f, sun: vec4f, visibility: f32, ao: f32) -> vec3f {
  let lin = srgbToLinear(albedo);
  let ndl = max(dot(n, sun.xyz), 0.0);
  let sunCol = vec3f(1.0, 0.95, 0.85) * sun.w;
  let sky = mix(vec3f(0.30, 0.32, 0.36), vec3f(0.55, 0.65, 0.80), n.z * 0.5 + 0.5);
  let ambient = sky * (0.35 + 0.35 * sun.w) * ao;
  return linearToSrgb(lin * (sunCol * ndl * visibility + ambient));
}

// Debug ramp for the step-count view.
fn stepsColor(steps: f32, maxSteps: f32) -> vec3f {
  let t = clamp(steps / maxSteps, 0.0, 1.0);
  return mix(vec3f(0.1, 0.2, 0.8), vec3f(1.0, 0.2, 0.1), t);
}

// Roof / wall / ground from the surface normal: the baked id volume is too coarse to place the
// boundary between those faces crisply. Installations (3) and other surfaces (5) keep their id.
fn surfaceTypeFromNormal(baked: u32, n: vec3f) -> u32 {
  if (baked == 3u || baked == 5u) { return baked; }
  if (n.z > 0.45) { return 1u; }
  if (n.z < -0.45) { return 2u; }
  return 0u;
}
