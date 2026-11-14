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
