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

// Height waves: stripes along world z with local wavelength
// lambda(z) = HEIGHT_WAVE_BASE + HEIGHT_WAVE_GROWTH * z. GROWTH = 0 gives evenly spaced stripes;
// GROWTH > 0 makes low parts ripple densely and tall towers undulate slowly.
// The phase (in cycles) is the integral of 1 / lambda over z.
const HEIGHT_WAVE_BASE: f32 = 6.0;    // wavelength at the ground, m
const HEIGHT_WAVE_GROWTH: f32 = 0.0;  // extra wavelength per metre of height
const HEIGHT_WAVE_SPEED: f32 = 0.15;  // cycles per second (slow upward drift under the sway)

fn heightWaveLength(z: f32) -> f32 { return HEIGHT_WAVE_BASE + HEIGHT_WAVE_GROWTH * max(z, 0.0); }

fn heightWavePhase(z: f32) -> f32 {
  if (HEIGHT_WAVE_GROWTH <= 0.0) { return max(z, 0.0) / HEIGHT_WAVE_BASE; }
  return log(heightWaveLength(z) / HEIGHT_WAVE_BASE) / HEIGHT_WAVE_GROWTH;
}

// Horizontal sway of the stripes, in cycles: a sum of plane sine waves crossing the city in
// different directions, so iso-height lines wobble instead of forming flat horizontal bands.
// Zero at the origin at t = 0. Each wave: (direction x, direction y, wavelength m, rad/s).
const SWAY_0: vec4f = vec4f(0.80, 0.60, 260.0, 0.45);
const SWAY_1: vec4f = vec4f(-0.50, 0.87, 150.0, -0.70);
const SWAY_2: vec4f = vec4f(0.97, -0.26, 95.0, 1.10);
const SWAY_3: vec4f = vec4f(-0.31, -0.95, 420.0, 0.30);
const SWAY_AMP: vec4f = vec4f(0.55, 0.35, 0.22, 0.60); // cycles

fn swayTerm(w: vec4f, xy: vec2f, time: f32) -> f32 {
  return sin(6.2831853 * dot(w.xy, xy) / w.z + w.w * time);
}

fn heightWaveSway(xy: vec2f, time: f32) -> f32 {
  return dot(SWAY_AMP, vec4f(swayTerm(SWAY_0, xy, time), swayTerm(SWAY_1, xy, time),
                              swayTerm(SWAY_2, xy, time), swayTerm(SWAY_3, xy, time)));
}

// Upper bound of |grad heightWaveSway| (cycles per metre): sum of amplitude * 2 pi / wavelength.
fn heightWaveSwaySlope() -> f32 {
  return 6.2831853 * dot(SWAY_AMP, 1.0 / vec4f(SWAY_0.z, SWAY_1.z, SWAY_2.z, SWAY_3.z));
}

// Share of each wave cycle that is solid silver: wide bands near the ground thinning linearly
// to narrow ribbons at HEIGHT_WAVE_DUTY_TOP and above.
const HEIGHT_WAVE_DUTY_LOW: f32 = 0.8;   // at the ground
const HEIGHT_WAVE_DUTY_HIGH: f32 = 0.35; // at HEIGHT_WAVE_DUTY_TOP and above
const HEIGHT_WAVE_DUTY_TOP: f32 = 150.0; // m

fn heightWaveDuty(z: f32) -> f32 {
  return mix(HEIGHT_WAVE_DUTY_LOW, HEIGHT_WAVE_DUTY_HIGH, clamp(z / HEIGHT_WAVE_DUTY_TOP, 0.0, 1.0));
}

// Distance (in cycles) from p to the nearest wave crest: 0 on a crest, 0.5 mid-trough.
fn heightWaveFromCrest(p: vec3f, time: f32) -> f32 {
  let phase = heightWavePhase(p.z) + heightWaveSway(p.xy, time) - HEIGHT_WAVE_SPEED * time;
  return abs(fract(phase + 0.5) - 0.5);
}

// Solid band around each crest (heightWaveDuty of the cycle); the rest are holes the view passes
// through. footprint = metres covered by one pixel: stripes narrower than a few pixels stay solid
// instead of aliasing into moire.
fn heightWaveSolid(p: vec3f, time: f32, footprint: f32) -> bool {
  let pixelsPerCycle = heightWaveLength(p.z) / max(footprint, 1e-6);
  if (pixelsPerCycle <= 3.0) { return true; }
  return heightWaveFromCrest(p, time) <= 0.5 * heightWaveDuty(p.z);
}

// Polished silver: dim diffuse, a sky / street reflection weighted by Fresnel, and a sharp sun
// highlight. v points from the surface towards the viewer.
fn shadeSilver(n: vec3f, v: vec3f, sun: vec4f, visibility: f32, ao: f32) -> vec3f {
  let silver = vec3f(0.80, 0.82, 0.85);
  let r = reflect(-v, n);
  let env = mix(vec3f(0.22, 0.23, 0.25), vec3f(0.70, 0.78, 0.90), smoothstep(-0.2, 0.4, r.z)) * (0.4 + 0.6 * sun.w);
  let fresnel = 0.6 + 0.4 * pow(1.0 - max(dot(n, v), 0.0), 5.0);
  let diffuse = max(dot(n, sun.xyz), 0.0) * visibility * sun.w * 0.25;
  let h = normalize(sun.xyz + v);
  let spec = pow(max(dot(n, h), 0.0), 96.0) * visibility * sun.w * 2.5;
  let lin = silver * (env * fresnel * ao + diffuse) + vec3f(spec);
  return linearToSrgb(min(lin, vec3f(1.0)));
}

// ---- height waves built into the distance field (the /waves/ page) ----

// Signed distance (m, negative inside) to the solid crest bands. The phase distance to the band
// edge is divided by a bound of its gradient (sway, height and the band width changing with
// height), so the value never overestimates the true distance (exact bound while
// HEIGHT_WAVE_GROWTH = 0).
fn heightWaveStripeDistance(p: vec3f, time: f32) -> f32 {
  let dutySlope = 0.5 * abs(HEIGHT_WAVE_DUTY_HIGH - HEIGHT_WAVE_DUTY_LOW) / HEIGHT_WAVE_DUTY_TOP;
  let slope = length(vec2f(heightWaveSwaySlope(), 1.0 / heightWaveLength(p.z) + dutySlope));
  return (heightWaveFromCrest(p, time) - 0.5 * heightWaveDuty(p.z)) / slope;
}

// Buildings as thin shells (|d| - thickness) intersected with the crest stripes: trough stripes
// become real openings in the distance field, so marching, soft shadows and AO see them directly.
fn waveShellDistance(p: vec3f, d: f32, time: f32, thickness: f32) -> f32 {
  return max(abs(d) - thickness, heightWaveStripeDistance(p, time));
}
