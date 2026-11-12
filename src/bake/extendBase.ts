/**
 * Pushes building bases below the ground plane for the SDF bake only.
 * Bases sit exactly at z = 0, where the ray march stops; trilinear reconstruction rounds the
 * bottom edge by up to a voxel, which shows up as a jagged gap at the foot of every wall.
 * Moving every vertex at (or below) ground level down by `depth` makes walls continue straight
 * through the ground plane, so the visible part of the wall keeps a crisp bottom edge.
 */
export const extendBelowGround = (positions: Float32Array, depth: number, groundEpsilon = 0.05): Float32Array => {
  const out = positions.slice();
  for (let i = 2; i < out.length; i += 3) {
    if (out[i] <= groundEpsilon) out[i] -= depth;
  }
  return out;
};
