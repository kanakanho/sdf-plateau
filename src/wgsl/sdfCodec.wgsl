// r8unorm encoding of truncated distances: value = d / (2T) + 0.5.
fn encodeSdf(d: f32, truncation: f32) -> f32 {
  return clamp(d / (2.0 * truncation) + 0.5, 0.0, 1.0);
}
fn decodeSdf(v: f32, truncation: f32) -> f32 {
  return (v - 0.5) * 2.0 * truncation;
}
