// World-space ray through an NDC position using the inverse of a GL-style (z in [-1, 1]) matrix.
struct Ray {
  origin: vec3f,
  dir: vec3f,
};

fn rayFromNdc(invViewProj: mat4x4f, ndc: vec2f) -> Ray {
  let pNear = invViewProj * vec4f(ndc, -1.0, 1.0);
  let pFar = invViewProj * vec4f(ndc, 1.0, 1.0);
  let a = pNear.xyz / pNear.w;
  let b = pFar.xyz / pFar.w;
  return Ray(a, normalize(b - a));
}
