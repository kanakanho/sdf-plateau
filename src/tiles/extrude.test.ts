import { describe, expect, it } from 'vitest';
import { SurfaceType, unpackTriInfo } from '../data/meshFormat';
import { RING_HOLE, type TileBuildings } from '../data/tileFormat';
import { capTriangles, extrudeTile, orientRing, signedArea2, wallTriangles } from './extrude';

/** Volume enclosed by a triangle soup (divergence theorem); positive when faces point outward. */
const signedVolume = (p: Float32Array | number[]): number => {
  let v = 0;
  for (let i = 0; i < p.length; i += 9) {
    const [ax, ay, az, bx, by, bz, cx, cy, cz] = Array.from(p.slice(i, i + 9));
    v += (ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx)) / 6;
  }
  return v;
};

const square = (x0: number, y0: number, s: number): [number, number][] => [
  [x0, y0], [x0 + s, y0], [x0 + s, y0 + s], [x0, y0 + s],
];

const tileOf = (rings: [number, number][][], holes: boolean[], height: number, index = 7): TileBuildings => ({
  ix: 0,
  iy: 0,
  origin: [0, 0],
  indices: Uint32Array.of(index),
  heights: Float32Array.of(height),
  attributes: new Float32Array(4),
  ringCounts: Uint32Array.of(rings.length),
  rings: Uint32Array.from(rings.map((r, i) => (r.length | (holes[i] ? RING_HOLE : 0)) >>> 0)),
  positions: Float32Array.from(rings.flat(2)),
});

describe('signedArea2 / orientRing', () => {
  it('measures orientation and makes exteriors CCW, holes CW', () => {
    const ccw = square(0, 0, 2);
    const cw = [...ccw].reverse();
    expect(signedArea2(ccw)).toBe(8);
    expect(signedArea2(cw)).toBe(-8);
    expect(signedArea2(orientRing(cw, false))).toBeGreaterThan(0);
    expect(signedArea2(orientRing(ccw, true))).toBeLessThan(0);
    expect(orientRing(ccw, false)).toBe(ccw);
  });
});

describe('wallTriangles', () => {
  it('emits two outward triangles per edge and skips repeated vertices', () => {
    const tris = wallTriangles([[0, 0], [1, 0], [1, 0], [1, 1], [0, 1]], 0, 3);
    expect(tris.length / 9).toBe(8);
    // first triangle of edge (0,0)->(1,0): outward normal of a CCW ring points to -y
    const [ax, ay, az, bx, by, bz, cx, cy, cz] = tris.slice(0, 9);
    const ny = (bz - az) * (cx - ax) - (bx - ax) * (cz - az);
    expect(ny).toBeLessThan(0);
    expect([ay, by, cy]).toEqual([0, 0, 0]);
  });
});

describe('capTriangles', () => {
  it('faces the requested way whatever the ring orientation', () => {
    for (const facing of [1, -1] as const) {
      const tris = capTriangles([...square(0, 0, 2)].reverse(), [], 5, facing);
      expect(tris.length / 9).toBe(2);
      for (let i = 0; i < tris.length; i += 9) {
        const nz = (tris[i + 3] - tris[i]) * (tris[i + 7] - tris[i + 1]) - (tris[i + 4] - tris[i + 1]) * (tris[i + 6] - tris[i]);
        expect(Math.sign(nz)).toBe(facing);
        expect([tris[i + 2], tris[i + 5], tris[i + 8]]).toEqual([5, 5, 5]);
      }
    }
  });
});

describe('extrudeTile', () => {
  it('builds a closed outward box per footprint with wall/roof/ground types and the area-wide index', () => {
    const { positions, triInfo } = extrudeTile(tileOf([square(10, 20, 4)], [false], 9), -3);
    expect(triInfo.length).toBe(12);
    expect(positions.length).toBe(12 * 9);
    expect(signedVolume(positions)).toBeCloseTo(16 * 12, 3);
    const types = Array.from(triInfo, (t) => unpackTriInfo(t));
    expect(types.every((t) => t.buildingIndex === 7)).toBe(true);
    expect(types.filter((t) => t.surfaceType === SurfaceType.Wall)).toHaveLength(8);
    expect(types.filter((t) => t.surfaceType === SurfaceType.Roof)).toHaveLength(2);
    expect(types.filter((t) => t.surfaceType === SurfaceType.Ground)).toHaveLength(2);
  });

  it('subtracts holes (courtyards) from the solid', () => {
    const { positions } = extrudeTile(tileOf([square(0, 0, 10), [...square(4, 4, 2)].reverse()], [false, true], 5), 0);
    expect(signedVolume(positions)).toBeCloseTo((100 - 4) * 5, 2);
  });

  it('handles several exteriors in one building (multi-part footprints)', () => {
    const { positions } = extrudeTile(tileOf([square(0, 0, 1), square(5, 5, 2)], [false, false], 2), 0);
    expect(signedVolume(positions)).toBeCloseTo((1 + 4) * 2, 4);
  });
});
