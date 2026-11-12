import { describe, expect, it } from 'vitest';
import { chebyshevDistance3D } from './distanceTransform';

const bruteForce = (occ: Uint8Array, dims: [number, number, number], cap: number) => {
  const [nx, ny, nz] = dims;
  const pts: [number, number, number][] = [];
  for (let z = 0; z < nz; z++) for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) if (occ[(z * ny + y) * nx + x]) pts.push([x, y, z]);
  const out = new Uint16Array(nx * ny * nz);
  for (let z = 0; z < nz; z++)
    for (let y = 0; y < ny; y++)
      for (let x = 0; x < nx; x++) {
        let best = cap;
        for (const p of pts) best = Math.min(best, Math.max(Math.abs(p[0] - x), Math.abs(p[1] - y), Math.abs(p[2] - z)));
        out[(z * ny + y) * nx + x] = best;
      }
  return out;
};

describe('chebyshevDistance3D', () => {
  it('is zero on occupied cells and counts rings around a single cell', () => {
    const dims: [number, number, number] = [5, 5, 5];
    const occ = new Uint8Array(125);
    occ[(2 * 5 + 2) * 5 + 2] = 1;
    const d = chebyshevDistance3D(occ, dims);
    expect(d[(2 * 5 + 2) * 5 + 2]).toBe(0);
    expect(d[0]).toBe(2);
    expect(d[(2 * 5 + 2) * 5 + 3]).toBe(1);
  });
  it('matches brute force on random occupancy', () => {
    const dims: [number, number, number] = [9, 7, 6];
    const n = dims[0] * dims[1] * dims[2];
    let seed = 7;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    const occ = Uint8Array.from({ length: n }, () => (rnd() < 0.03 ? 1 : 0));
    expect(Array.from(chebyshevDistance3D(occ, dims, 50))).toEqual(Array.from(bruteForce(occ, dims, 50)));
  });
  it('caps distances (and returns the cap with no occupied cells)', () => {
    const d = chebyshevDistance3D(new Uint8Array(8), [2, 2, 2], 9);
    expect(Array.from(d)).toEqual(Array(8).fill(9));
  });
});
