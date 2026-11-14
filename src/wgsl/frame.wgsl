// Per-frame uniform block (layout mirrored by packFrameParams in TS).
struct FrameParams {
  viewProj: mat4x4f,     // local meters -> WebGPU clip (z in [0, 1])
  invViewProj: mat4x4f,  // inverse of the GL-style matrix (z in [-1, 1]), for ray generation
  sunDir: vec4f,         // xyz towards the sun, w = intensity (0 at night)
  viewport: vec4f,       // width, height, time, unused
  colorMode: u32,        // 0 surface, 1 height, 2 usage, 3 year, 4 steps (debug), 5 height waves
  flags: u32,            // bit0 shadows, bit1 ao, bit2 exact hit refinement, bit3 ground shadows
  selected: u32,         // building index + 1 (0 = none)
  maxSteps: u32,
};

const FLAG_SHADOWS: u32 = 1u;
const FLAG_AO: u32 = 2u;
const FLAG_REFINE: u32 = 4u;
const FLAG_GROUND: u32 = 8u;
const COLOR_MODE_WAVES: u32 = 5u;

fn hasFlag(flags: u32, f: u32) -> bool { return (flags & f) != 0u; }
