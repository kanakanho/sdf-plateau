/**
 * Exact 3D chessboard (Chebyshev) distance transform, in cells, to the nearest occupied cell.
 * Two raster passes with the 26-neighbourhood. Occupied cells get 0; values are capped.
 */
export const chebyshevDistance3D = (
  occupied: Uint8Array,
  dims: readonly [number, number, number],
  cap = 255,
): Uint16Array => {
  const [nx, ny, nz] = dims;
  const d = new Uint16Array(nx * ny * nz);
  for (let i = 0; i < d.length; i++) d[i] = occupied[i] ? 0 : cap;
  const at = (x: number, y: number, z: number) => (z * ny + y) * nx + x;
  const relax = (x: number, y: number, z: number, sign: 1 | -1) => {
    const i = at(x, y, z);
    let best = d[i];
    if (best === 0) return;
    // neighbours that precede (x,y,z) in the scan order of this pass
    for (let dz = -1; dz <= 0; dz++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dz === 0 && (dy > 0 || (dy === 0 && dx >= 0))) continue;
          const xx = x + dx * sign;
          const yy = y + dy * sign;
          const zz = z + dz * sign;
          if (xx < 0 || yy < 0 || zz < 0 || xx >= nx || yy >= ny || zz >= nz) continue;
          const v = d[at(xx, yy, zz)] + 1;
          if (v < best) best = v;
        }
      }
    }
    d[i] = Math.min(best, cap);
  };
  for (let z = 0; z < nz; z++) for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) relax(x, y, z, 1);
  for (let z = nz - 1; z >= 0; z--) for (let y = ny - 1; y >= 0; y--) for (let x = nx - 1; x >= 0; x--) relax(x, y, z, -1);
  return d;
};
