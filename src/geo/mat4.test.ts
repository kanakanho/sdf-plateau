import { describe, expect, it } from 'vitest';
import {
  fromValues,
  identity,
  invert,
  lookAt,
  multiply,
  perspectiveGl,
  projectPoint,
  scaling,
  transformVec4,
  translation,
} from './mat4';

const expectMatClose = (a: ArrayLike<number>, b: ArrayLike<number>, eps = 1e-9) => {
  for (let i = 0; i < 16; i++) expect(a[i]).toBeCloseTo(b[i], -Math.log10(eps));
};

describe('identity', () => {
  it('has ones on the diagonal', () => {
    expect(Array.from(identity())).toEqual([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  });
});

describe('fromValues', () => {
  it('copies 16 values', () => {
    const src = Array.from({ length: 16 }, (_, i) => i);
    expect(Array.from(fromValues(src))).toEqual(src);
  });
  it('rejects wrong lengths', () => {
    expect(() => fromValues([1, 2, 3])).toThrow();
  });
});

describe('multiply', () => {
  it('composes translation then scaling (column-major)', () => {
    const m = multiply(translation(1, 2, 3), scaling(2, 2, 2));
    expect(transformVec4(m, [1, 1, 1, 1])).toEqual([3, 4, 5, 1]);
  });
  it('identity is neutral', () => {
    const t = translation(4, 5, 6);
    expectMatClose(multiply(identity(), t), t);
    expectMatClose(multiply(t, identity()), t);
  });
});

describe('translation / scaling', () => {
  it('translation moves points', () => {
    expect(transformVec4(translation(1, -2, 3), [0, 0, 0, 1])).toEqual([1, -2, 3, 1]);
  });
  it('translation leaves directions alone', () => {
    expect(transformVec4(translation(1, -2, 3), [1, 0, 0, 0])).toEqual([1, 0, 0, 0]);
  });
  it('scaling scales axes', () => {
    expect(transformVec4(scaling(2, 3, 4), [1, 1, 1, 1])).toEqual([2, 3, 4, 1]);
  });
});

describe('invert', () => {
  it('inverts a composite transform', () => {
    const m = multiply(translation(10, -3, 7), multiply(scaling(2, 5, 0.5), translation(1, 1, 1)));
    const inv = invert(m)!;
    expectMatClose(multiply(m, inv), identity());
  });
  it('returns null for singular matrices', () => {
    expect(invert(scaling(1, 0, 1))).toBeNull();
  });
});

describe('transformVec4', () => {
  it('applies w component', () => {
    expect(transformVec4(identity(), [1, 2, 3, 4])).toEqual([1, 2, 3, 4]);
  });
});

describe('projectPoint', () => {
  it('performs perspective divide', () => {
    const m = identity();
    m[15] = 2;
    expect(projectPoint(m, [2, 4, 6])).toEqual([1, 2, 3]);
  });
});

describe('perspectiveGl', () => {
  it('maps the near plane to z=-1 and far plane to z=+1', () => {
    const p = perspectiveGl(Math.PI / 2, 1, 1, 100);
    expect(projectPoint(p, [0, 0, -1])[2]).toBeCloseTo(-1, 12);
    expect(projectPoint(p, [0, 0, -100])[2]).toBeCloseTo(1, 12);
  });
  it('maps the 45° edge to x=1 for a 90° fov', () => {
    expect(projectPoint(perspectiveGl(Math.PI / 2, 1, 1, 100), [5, 0, -5])[0]).toBeCloseTo(1, 12);
  });
});

describe('lookAt', () => {
  it('puts the target on the -z axis in view space', () => {
    const v = lookAt([10, 0, 0], [0, 0, 0], [0, 0, 1]);
    const p = transformVec4(v, [0, 0, 0, 1]);
    expect(p[0]).toBeCloseTo(0, 12);
    expect(p[1]).toBeCloseTo(0, 12);
    expect(p[2]).toBeCloseTo(-10, 12);
  });
  it('keeps up pointing to +y', () => {
    const v = lookAt([10, 0, 0], [0, 0, 0], [0, 0, 1]);
    expect(transformVec4(v, [0, 0, 1, 0])[1]).toBeCloseTo(1, 12);
  });
});
