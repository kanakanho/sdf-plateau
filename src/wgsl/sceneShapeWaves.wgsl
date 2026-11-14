// Scene shape hook (/waves/ page): buildings become thin silver shells cut by the moving height
// wave stripes, directly in the distance field. Valid for lower bounds too: the result is
// monotone in |d|, so a bound on |d| gives a bound on the shaped distance.
// Requires globals: frame.
// penumbra sharpness of the soft shadow (Quilez k): sharp enough that light still passes the
// metre-scale openings tens of metres away (the real sun would be about 200)
const SHADOW_SHARPNESS: f32 = 40.0;
const SHAPE_CUTS_HOLES: bool = true;
const WAVE_SHELL_THICKNESS: f32 = 0.15; // half thickness, m (thin: slanted light still fits through the openings)

fn shapeDistance(p: vec3f, d: f32) -> f32 {
  return waveShellDistance(p, d, frame.viewport.z, WAVE_SHELL_THICKNESS);
}
