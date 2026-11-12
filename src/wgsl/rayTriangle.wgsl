// Möller–Trumbore ray/triangle intersection (double sided). Returns t, or -1 when missed.
fn rayTriangle(ro: vec3f, rd: vec3f, a: vec3f, b: vec3f, c: vec3f) -> f32 {
  let e1 = b - a;
  let e2 = c - a;
  let pv = cross(rd, e2);
  let det = dot(e1, pv);
  if (abs(det) < 1e-10) { return -1.0; }
  let inv = 1.0 / det;
  let tv = ro - a;
  let u = dot(tv, pv) * inv;
  if (u < 0.0 || u > 1.0) { return -1.0; }
  let qv = cross(tv, e1);
  let v = dot(rd, qv) * inv;
  if (v < 0.0 || u + v > 1.0) { return -1.0; }
  let t = dot(e2, qv) * inv;
  return select(-1.0, t, t > 0.0);
}
