// Colour helpers for building shading.
fn srgbToLinear(c: vec3f) -> vec3f { return pow(c, vec3f(2.2)); }
fn linearToSrgb(c: vec3f) -> vec3f { return pow(max(c, vec3f(0.0)), vec3f(1.0 / 2.2)); }

// Surface type: 0 wall, 1 roof, 2 ground, 3 installation, 4 lod1, 5 other.
fn surfaceColor(t: u32) -> vec3f {
  switch t {
    case 0u: { return vec3f(0.86, 0.84, 0.80); }
    case 1u: { return vec3f(0.72, 0.42, 0.36); }
    case 2u: { return vec3f(0.45, 0.45, 0.45); }
    case 3u: { return vec3f(0.55, 0.62, 0.70); }
    default: { return vec3f(0.80, 0.80, 0.80); }
  }
}

// Height ramp (0 m -> 250 m): teal -> yellow -> red.
fn heightColor(h: f32) -> vec3f {
  let t = clamp(h / 250.0, 0.0, 1.0);
  let c0 = vec3f(0.20, 0.55, 0.65);
  let c1 = vec3f(0.95, 0.85, 0.35);
  let c2 = vec3f(0.85, 0.25, 0.20);
  if (t < 0.5) { return mix(c0, c1, t * 2.0); }
  return mix(c1, c2, (t - 0.5) * 2.0);
}

// Usage category (see src/data/buildings.ts usageCategory).
fn usageColor(cat: u32) -> vec3f {
  switch cat {
    case 1u: { return vec3f(0.35, 0.55, 0.85); }
    case 2u: { return vec3f(0.92, 0.55, 0.30); }
    case 3u: { return vec3f(0.70, 0.45, 0.80); }
    case 4u: { return vec3f(0.55, 0.78, 0.45); }
    case 5u: { return vec3f(0.95, 0.80, 0.35); }
    case 6u: { return vec3f(0.55, 0.55, 0.55); }
    default: { return vec3f(0.80, 0.80, 0.80); }
  }
}

// Construction year ramp (1900 -> 2025): dark blue (old) -> white -> orange (new); 0 = unknown.
fn yearColor(year: f32) -> vec3f {
  if (year <= 0.0) { return vec3f(0.6, 0.6, 0.6); }
  let t = clamp((year - 1900.0) / 125.0, 0.0, 1.0);
  if (t < 0.5) { return mix(vec3f(0.15, 0.25, 0.55), vec3f(0.95, 0.95, 0.95), t * 2.0); }
  return mix(vec3f(0.95, 0.95, 0.95), vec3f(0.95, 0.50, 0.15), (t - 0.5) * 2.0);
}
