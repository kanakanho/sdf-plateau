// Scene shape hook (plain): the baked building distance as is.
// The SDF renderer reads every distance through shapeDistance; see sceneShapeWaves.wgsl.
// penumbra sharpness of the soft shadow (Quilez k): wide, soft shadows
const SHADOW_SHARPNESS: f32 = 8.0;
const SHAPE_CUTS_HOLES: bool = false;

fn shapeDistance(p: vec3f, d: f32) -> f32 { return d; }
