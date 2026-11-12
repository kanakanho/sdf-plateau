import { describe, expect, it } from 'vitest';
import { computeGridSpec } from './gridSpec';
import { BRICK_EMPTY_FLAG, buildIndirection, decodeIndirection } from './indirection';

describe('buildIndirection', () => {
  const spec = computeGridSpec([0, 0, 0], [28, 4, 4], { voxelSize: 1, paddingVoxels: 0 }); // dims 4x1x1
  it('stores slot indices for occupied bricks and distances otherwise', () => {
    const t = buildIndirection(spec, Uint32Array.from([1, 3]));
    expect(Array.from(t, decodeIndirection)).toEqual([
      { empty: true, value: 1 },
      { empty: false, value: 0 },
      { empty: true, value: 1 },
      { empty: false, value: 1 },
    ]);
  });
  it('uses the cap when there is nothing occupied', () => {
    const t = buildIndirection(spec, new Uint32Array(), 20);
    expect(t[0]).toBe((BRICK_EMPTY_FLAG | 20) >>> 0);
  });
});

describe('decodeIndirection', () => {
  it('splits the flag', () => {
    expect(decodeIndirection(5)).toEqual({ empty: false, value: 5 });
    expect(decodeIndirection((BRICK_EMPTY_FLAG | 3) >>> 0)).toEqual({ empty: true, value: 3 });
  });
});
