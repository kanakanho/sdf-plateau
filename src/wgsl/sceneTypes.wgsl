// Uniform block describing the baked scene (layout mirrored by packSceneParams in TS).
struct SceneParams {
  gridOrigin: vec3f,
  voxelSize: f32,
  dims: vec3u,
  truncation: f32,
  atlasSize: vec3f,
  brickWorld: f32,
  slotsX: u32,
  slotsY: u32,
  refineFactor: u32,  // children per axis of refined bricks
  slotCount: u32,
};

fn sceneTri(i: u32, k: u32) -> vec3f {
  let o = i * 9u + k * 3u;
  return vec3f(sceneTris[o], sceneTris[o + 1u], sceneTris[o + 2u]);
}
