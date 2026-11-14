// Vertex k of triangle i from the flat triangle buffer.
// Requires globals: sceneTris (array<f32>, 9 floats per triangle).
fn sceneTri(i: u32, k: u32) -> vec3f {
  let o = i * 9u + k * 3u;
  return vec3f(sceneTris[o], sceneTris[o + 1u], sceneTris[o + 2u]);
}
